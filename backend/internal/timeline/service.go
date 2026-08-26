package timeline

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"google.golang.org/protobuf/encoding/protojson"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/workspace"
)

// Notifier publishes pipeline events (SSE hub).
type Notifier interface {
	PublishJSON(topic string, payload map[string]any)
}

// Service processes every segment of a voice_processing video into timelines
// and advances the machine exactly once when the last one lands.
type Service struct {
	queries *sqlc.Queries
	dataDir string
	hub     Notifier
}

func NewService(queries *sqlc.Queries, dataDir string, hub Notifier) *Service {
	return &Service{queries: queries, dataDir: dataDir, hub: hub}
}

// blendshapesFile mirrors the S2-03 serializer output.
type blendshapesFile struct {
	Names   []string          `json:"names"`
	Samples []json.RawMessage `json:"samples"`
}

// Run processes all missing segment timelines for the slug. Idempotent:
// existing timelines are skipped; when everything is present the canonical
// transition fires exactly once. Partial failure → blocked (structured).
func (s *Service) Run(ctx context.Context, slug string) {
	video, err := s.queries.GetVideoBySlug(ctx, slug)
	if err != nil {
		slog.Error("timeline.video_lookup_failed", slog.String("slug", slug), slog.Any("error", err))
		return
	}
	if videostate.State(video.Status) != videostate.StateVoiceProcess {
		return // silent no-op outside the voice-processing window
	}
	root := filepath.Join(s.dataDir, "videos", slug)

	scriptRaw, err := os.ReadFile(filepath.Join(root, "script.json"))
	if err != nil {
		s.block(ctx, video.ID, slug, "read script: "+err.Error())
		return
	}
	var script struct {
		Segments []struct {
			ID string `json:"id"`
		} `json:"segments"`
	}
	if err := json.Unmarshal(scriptRaw, &script); err != nil {
		s.block(ctx, video.ID, slug, "parse script: "+err.Error())
		return
	}

	timelinesDir := filepath.Join(root, "timelines")
	if err := os.MkdirAll(timelinesDir, 0o755); err != nil {
		s.block(ctx, video.ID, slug, "mkdir timelines: "+err.Error())
		return
	}

	durationMs := int64(0)
	for _, seg := range script.Segments {
		outPath := filepath.Join(timelinesDir, seg.ID+".timeline.json")
		if _, statErr := os.Stat(outPath); statErr == nil {
			continue // idempotent skip
		}

		tl, buildErr := s.buildSegment(root, seg.ID)
		if buildErr != nil {
			s.block(ctx, video.ID, slug,
				fmt.Sprintf("segment %s: %s", seg.ID, buildErr.Error()))
			return
		}
		body, mErr := protojson.MarshalOptions{}.Marshal(tl)
		if mErr != nil {
			s.block(ctx, video.ID, slug, "marshal: "+mErr.Error())
			return
		}
		if wErr := os.WriteFile(outPath, body, 0o644); wErr != nil {
			s.block(ctx, video.ID, slug, "write timeline: "+wErr.Error())
			return
		}
		if tl.GetDurationMs() > durationMs {
			durationMs = tl.GetDurationMs()
		}
		slog.Info("timeline.written",
			slog.String("slug", slug), slog.String("segment", seg.ID))
	}

	// Every segment has a timeline now → canonical transition.
	if err := videostate.Transition(videostate.StateVoiceProcess, videostate.StateScenesPending); err != nil {
		slog.Debug("timeline.transition_skipped", slog.Any("reason", err))
		return
	}
	if uerr := s.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID: video.ID, Status: string(videostate.StateScenesPending),
	}); uerr != nil {
		s.block(ctx, video.ID, slug, "status update: "+uerr.Error())
		return
	}
	if herr := s.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: video.ID, Status: string(videostate.StateScenesPending),
		Reason: "all avatar timelines generated", Actor: "timeline",
	}); herr != nil {
		slog.Warn("timeline.history_failed", slog.Any("error", herr))
	}
	if cerr := workspace.Commit(root, fmt.Sprintf("chore(%s): avatar timelines", slug)); cerr != nil {
		slog.Warn("timeline.commit_failed", slog.String("slug", slug), slog.Any("error", cerr))
	}

	slog.Info("timeline.all_done", slog.String("slug", slug))
	if s.hub != nil {
		payload := map[string]any{"type": "scenes_pending", "slug": slug}
		s.hub.PublishJSON("global", payload)
		s.hub.PublishJSON(fmt.Sprintf("video:%s", video.ID.String()), payload)
	}
}

func (s *Service) buildSegment(root, segmentID string) (*studiov1.AvatarTimeline, error) {
	audioDir := filepath.Join(root, "audio")

	// 1. Visemes sidecar from S3-03.
	visemesRaw, err := os.ReadFile(filepath.Join(audioDir, segmentID+".visemes.json"))
	if err != nil {
		return nil, fmt.Errorf("visemes sidecar missing: %w", err)
	}
	var sidecar struct {
		WavSha256 string       `json:"wav_sha256"`
		Cues      []MouthCueIn `json:"cues"`
	}
	if err := json.Unmarshal(visemesRaw, &sidecar); err != nil {
		return nil, fmt.Errorf("visemes parse: %w", err)
	}

	// 2. Blendshapes with names from S2-07 file.
	bsRaw, err := os.ReadFile(filepath.Join(audioDir, segmentID+".blendshapes.json"))
	if err != nil {
		return nil, fmt.Errorf("blendshapes missing: %w", err)
	}
	var bs blendshapesFile
	if err := json.Unmarshal(bsRaw, &bs); err != nil {
		return nil, fmt.Errorf("blendshapes parse: %w", err)
	}
	if len(bs.Names) == 0 {
		return nil, errors.New("blendshapes file lacks names[] (re-record with current studio)")
	}
	samples := make([]NamedSample, 0, len(bs.Samples))
	for i, rawRow := range bs.Samples {
		var row []float64
		if err := json.Unmarshal(rawRow, &row); err != nil || len(row) < 1+len(bs.Names) {
			return nil, fmt.Errorf("sample %d malformed", i)
		}
		values := make(map[string]float64, len(bs.Names))
		for k, name := range bs.Names {
			values[name] = row[1+k]
		}
		samples = append(samples, NamedSample{T: int64(row[0]), Values: values})
	}

	// Duration = last sample t (audio frames drive it upstream anyway).
	durationMs := int64(0)
	if n := len(samples); n > 0 {
		durationMs = samples[n-1].T
	}

	// 3. Word timings (optional; S3-02 output persisted by orchestrator).
	var words []WordTimingIn
	if wordsRaw, err := os.ReadFile(filepath.Join(timelinesDirOf(root), segmentID+".words.json")); err == nil {
		if err := json.Unmarshal(wordsRaw, &words); err != nil {
			return nil, fmt.Errorf("words parse: %w", err)
		}
	}

	in := BuildInput{
		SegmentID:  segmentID,
		DurationMs: durationMs,
		MouthCues:  sidecar.Cues,
		Samples:    samples,
		Words:      words,
	}
	tl, err := Build(in)
	if err != nil {
		return nil, err
	}
	// Silence insertion needs the real duration even for empty cues.
	if len(sidecar.Cues) == 0 && durationMs > 0 {
		tl.MouthCues = []*studiov1.TimelineMouthCue{{
			Shape: "X", StartMs: 0, EndMs: durationMs,
		}}
	}
	return tl, nil
}

func timelinesDirOf(root string) string { return filepath.Join(root, "timelines") }

func (s *Service) block(ctx context.Context, videoID [16]byte, slug, reason string) {
	slog.Error("timeline.blocked", slog.String("slug", slug), slog.String("reason", reason))
	if err := videostate.Transition(videostate.StateVoiceProcess, videostate.StateBlocked); err != nil {
		slog.Warn("timeline.blocked_transition_rejected", slog.Any("error", err))
		return
	}
	if uerr := s.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID: videoID, Status: string(videostate.StateBlocked),
	}); uerr != nil {
		slog.Error("timeline.blocked_status_failed", slog.Any("error", uerr))
		return
	}
	if ierr := s.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: videoID, Status: string(videostate.StateBlocked),
		Reason: reason, Actor: "timeline",
	}); ierr != nil {
		slog.Warn("timeline.blocked_history_failed", slog.Any("error", ierr))
	}
}

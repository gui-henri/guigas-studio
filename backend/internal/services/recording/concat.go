// Package recording concatenates approved segment takes into full.wav,
// emits the recording manifest and advances the state machine
// (recording → voice_processing) once everything checks out (S2-09).
package recording

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
)

const sampleRate = 48000
const bytesPerFrame = 2 // mono 16-bit

// Notifier publishes pipeline events (the SSE hub satisfies this).
type Notifier interface {
	PublishJSON(topic string, payload map[string]any)
}

// Service runs idempotent concat jobs per slug.
type Service struct {
	queries *sqlc.Queries
	dataDir string
	hub     Notifier

	mu    sync.Mutex
	inFly map[string]bool
}

func NewService(queries *sqlc.Queries, dataDir string, hub Notifier) *Service {
	return &Service{queries: queries, dataDir: dataDir, hub: hub, inFly: map[string]bool{}}
}

// Run executes one concat attempt for the slug. Safe to call after every
// upload: it no-ops unless every segment has both artifacts and the video is
// still in recording.
func (s *Service) Run(ctx context.Context, slug string) {
	s.mu.Lock()
	if s.inFly[slug] {
		s.mu.Unlock()
		return
	}
	s.inFly[slug] = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.inFly, slug)
		s.mu.Unlock()
	}()

	if err := s.run(ctx, slug); err != nil {
		slog.Error("recording.concat_failed", slog.String("slug", slug), slog.Any("error", err))
	}
}

func (s *Service) run(ctx context.Context, slug string) error {
	video, err := s.queries.GetVideoBySlug(ctx, slug)
	if err != nil {
		return fmt.Errorf("video lookup: %w", err)
	}
	if videostate.State(video.Status) != videostate.StateRecording {
		return nil // silent no-op outside the recording window
	}

	root := filepath.Join(s.dataDir, "videos", slug)
	scriptPath := filepath.Join(root, "script.json")
	rawScript, err := os.ReadFile(scriptPath)
	if err != nil {
		return fmt.Errorf("read script: %w", err)
	}
	var script struct {
		Segments []struct {
			ID string `json:"id"`
		} `json:"segments"`
	}
	if err := json.Unmarshal(rawScript, &script); err != nil {
		return fmt.Errorf("parse script: %w", err)
	}

	takes, err := s.queries.ListTakesByVideo(ctx, slug)
	if err != nil {
		return fmt.Errorf("list takes: %w", err)
	}
	audioBySegment := map[string]sqlc.Take{}
	for _, t := range takes {
		if t.Kind == "audio" {
			audioBySegment[t.SegmentID] = t
		}
	}

	type segPlan struct {
		id     string
		path   string
		sha    string
		frames int64
	}
	var plans []segPlan
	for _, seg := range script.Segments {
		take, ok := audioBySegment[seg.ID]
		if !ok {
			slog.Debug("recording.concat_incomplete",
				slog.String("slug", slug), slog.String("missing", seg.ID))
			return nil // still something to record: quiet no-op
		}
		plans = append(plans, segPlan{
			id:   seg.ID,
			path: filepath.Join(root, take.RelPath),
			sha:  take.Sha256,
		})
	}

	// Concat pure Go: validate identical PCM formats and copy payloads.
	outPath := filepath.Join(root, "audio", "full.wav")
	paths := make([]string, len(plans))
	for i := range plans {
		paths[i] = plans[i].path
	}
	totalFrames, perSegFrames, err := concatWavs(paths, outPath)
	if err != nil {
		return s.fail(ctx, video.ID, slug, "concat: "+err.Error())
	}
	for i := range plans {
		plans[i].frames = perSegFrames[i]
	}

	// Manifest from actual byte counts (never client-reported durations).
	startMs := int64(0)
	type manifestSeg struct {
		SegmentID  string `json:"segment_id"`
		Index      int    `json:"index"`
		StartMs    int64  `json:"start_ms"`
		DurationMs int64  `json:"duration_ms"`
		TakeSha256 string `json:"take_sha256"`
	}
	segs := make([]manifestSeg, 0, len(plans))
	for i, p := range plans {
		durMs := p.frames * 1000 / sampleRate
		segs = append(segs, manifestSeg{
			SegmentID: p.id, Index: i, StartMs: startMs,
			DurationMs: durMs, TakeSha256: p.sha,
		})
		startMs += durMs
	}
	manifest := map[string]any{
		"version":           1,
		"generated_at":      time.Now().UTC().Format(time.RFC3339),
		"sample_rate":       sampleRate,
		"total_duration_ms": totalFrames * 1000 / sampleRate,
		"segments":          segs,
	}
	manifestBody, _ := json.MarshalIndent(manifest, "", "  ")

	manifestDir := filepath.Join(root, "timelines")
	if err := os.MkdirAll(manifestDir, 0o755); err != nil {
		return s.fail(ctx, video.ID, slug, "mkdir timelines: "+err.Error())
	}
	manifestPath := filepath.Join(manifestDir, "recording.manifest.json")
	if err := os.WriteFile(manifestPath+".tmp", manifestBody, 0o644); err != nil {
		return s.fail(ctx, video.ID, slug, "write manifest: "+err.Error())
	}
	if err := os.Rename(manifestPath+".tmp", manifestPath); err != nil {
		return s.fail(ctx, video.ID, slug, "publish manifest: "+err.Error())
	}

	// Canonical trigger: concat concluded.
	if err := videostate.Transition(videostate.StateRecording, videostate.StateVoiceProcess); err != nil {
		return s.fail(ctx, video.ID, slug, err.Error())
	}
	if err := s.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID: video.ID, Status: string(videostate.StateVoiceProcess),
	}); err != nil {
		return s.fail(ctx, video.ID, slug, "status update: "+err.Error())
	}
	if err := s.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: video.ID, Status: string(videostate.StateVoiceProcess),
		Reason: "recording.manifest.json written", Actor: "concat",
	}); err != nil {
		slog.Warn("recording.history_insert_failed", slog.Any("error", err))
	}

	// Commit the versionable manifest (binaries stay ignored, T-07/D-11).
	if gitErr := commitWorkspace(root, fmt.Sprintf("chore(%s): recording manifest", slug)); gitErr != nil {
		slog.Warn("recording.commit_failed", slog.String("slug", slug), slog.Any("error", gitErr))
	}

	slog.Info("recording.concat_done",
		slog.String("slug", slug),
		slog.Int64("duration_ms", totalFrames*1000/sampleRate))
	if s.hub != nil {
		s.hub.PublishJSON("global", map[string]any{
			"type": "voice_processing_ready", "slug": slug,
		})
		s.hub.PublishJSON(fmt.Sprintf("video:%s", video.ID.String()), map[string]any{
			"type": "voice_processing_ready", "slug": slug,
		})
	}
	return nil
}

// fail moves the video to blocked with a structured reason.
func (s *Service) fail(ctx context.Context, videoID [16]byte, slug, reason string) error {
	slog.Error("recording.blocked", slog.String("slug", slug), slog.String("reason", reason))
	if err := videostate.Transition(videostate.StateRecording, videostate.StateBlocked); err == nil {
		if uerr := s.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
			ID: videoID, Status: string(videostate.StateBlocked),
		}); uerr == nil {
			if ierr := s.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
				VideoID: videoID, Status: string(videostate.StateBlocked),
				Reason: reason, Actor: "concat",
			}); ierr != nil {
				slog.Warn("recording.blocked_history_failed", slog.Any("error", ierr))
			}
		}
	}
	return errors.New(reason)
}

// concatWavs validates homogeneous PCM16/48kHz/mono inputs and copies their
// data payloads in order under a fresh RIFF header. Returns total frames and
// per-file frames.
func concatWavs(paths []string, outPath string) (int64, []int64, error) {
	infos := make([]wavInfo, len(paths))
	perFile := make([]int64, len(paths))

	for i, p := range paths {
		fi, err := os.Open(p)
		if err != nil {
			return 0, nil, fmt.Errorf("open %s: %w", filepath.Base(p), err)
		}
		info, err := inspectWav(fi)
		fi.Close()
		if err != nil {
			return 0, nil, fmt.Errorf("%s: %w", filepath.Base(p), err)
		}
		infos[i] = info
		perFile[i] = info.dataSize / bytesPerFrame
	}

	out, err := os.Create(outPath + ".tmp")
	if err != nil {
		return 0, nil, err
	}
	defer out.Close()

	totalData := int64(0)
	for _, info := range infos {
		totalData += info.dataSize
	}
	header := buildWavHeader(totalData)
	if _, err := out.Write(header); err != nil {
		return 0, nil, err
	}
	for i, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			return 0, nil, err
		}
		if _, err := f.Seek(infos[i].dataOffset, ioSeekStart); err != nil {
			f.Close()
			return 0, nil, err
		}
		n, err := ioCopyN(out, f, infos[i].dataSize)
		f.Close()
		if err != nil || n != infos[i].dataSize {
			return 0, nil, fmt.Errorf("copy %s: %w", filepath.Base(p), err)
		}
	}
	if err := out.Sync(); err != nil {
		return 0, nil, err
	}
	if err := os.Rename(outPath+".tmp", outPath); err != nil {
		return 0, nil, err
	}
	return totalData / bytesPerFrame, perFile, nil
}

const ioSeekStart = 0

type wavInfo struct {
	dataOffset int64
	dataSize   int64
}

func ioCopyN(dst ioWriter, src ioReader, n int64) (int64, error) {
	buf := make([]byte, 128<<10)
	var written int64
	for written < n {
		want := int64(len(buf))
		if remaining := n - written; remaining < want {
			want = remaining
		}
		read, rerr := src.Read(buf[:want])
		if read > 0 {
			wrote, werr := dst.Write(buf[:read])
			written += int64(wrote)
			if werr != nil {
				return written, werr
			}
		}
		if rerr != nil {
			return written, rerr
		}
	}
	return written, nil
}

type ioReader = interface{ Read([]byte) (int, error) }
type ioWriter = interface{ Write([]byte) (int, error) }

// inspectWav parses a canonical 44-byte-header WAV (our own encoder output)
// and validates the fixed format contract.
func inspectWav(f ioReader) (wavInfo, error) {
	head := make([]byte, 44)
	if _, err := ioReadFull(head, f); err != nil {
		return wavInfo{}, errors.New("short wav header")
	}
	stringAt := func(o, n int) string { return string(head[o : o+n]) }
	if stringAt(0, 4) != "RIFF" || stringAt(8, 4) != "WAVE" || stringAt(12, 4) != "fmt " {
		return wavInfo{}, errors.New("not a RIFF/WAVE file")
	}
	if binary.LittleEndian.Uint16(head[20:22]) != 1 || // PCM
		binary.LittleEndian.Uint16(head[22:24]) != 1 || // mono
		binary.LittleEndian.Uint32(head[24:28]) != sampleRate ||
		binary.LittleEndian.Uint16(head[34:36]) != 16 {
		return wavInfo{}, errors.New("expected PCM 16-bit mono 48kHz")
	}
	riffSize := int64(binary.LittleEndian.Uint32(head[4:8]))
	if stringAt(36, 4) != "data" {
		return wavInfo{}, errors.New("non-canonical wav layout")
	}
	dataSize := int64(binary.LittleEndian.Uint32(head[40:44]))
	if riffSize != 36+dataSize {
		return wavInfo{}, errors.New("riff/data size mismatch")
	}
	return wavInfo{dataOffset: 44, dataSize: dataSize}, nil
}

func ioReadFull(buf []byte, f ioReader) (int, error) {
	total := 0
	for total < len(buf) {
		n, err := f.Read(buf[total:])
		total += n
		if err != nil {
			return total, err
		}
	}
	return total, nil
}

func buildWavHeader(dataSize int64) []byte {
	h := make([]byte, 44)
	copy(h[0:4], "RIFF")
	binary.LittleEndian.PutUint32(h[4:8], uint32(36+dataSize))
	copy(h[8:12], "WAVE")
	copy(h[12:16], "fmt ")
	binary.LittleEndian.PutUint32(h[16:20], 16)
	binary.LittleEndian.PutUint16(h[20:22], 1)
	binary.LittleEndian.PutUint16(h[22:24], 1)
	binary.LittleEndian.PutUint32(h[24:28], sampleRate)
	binary.LittleEndian.PutUint32(h[28:32], sampleRate*bytesPerFrame)
	binary.LittleEndian.PutUint16(h[32:34], bytesPerFrame)
	binary.LittleEndian.PutUint16(h[34:36], 16)
	copy(h[36:40], "data")
	binary.LittleEndian.PutUint32(h[40:44], uint32(dataSize))
	return h
}

func commitWorkspace(root, message string) error {
	run := func(args ...string) error {
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		return cmd.Run()
	}
	gitDir := filepath.Join(root, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		if err := run("init"); err != nil {
			return err
		}
		_ = run("config", "user.name", "Studio Server")
		_ = run("config", "user.email", "studio@guigas.local")
	}
	if err := run("add", "-A"); err != nil {
		return err
	}
	cmd := exec.Command("git", "commit", "-m", message, "--allow-empty")
	cmd.Dir = root
	return cmd.Run()
}

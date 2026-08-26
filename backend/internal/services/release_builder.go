// Release builder (S5-09): assembles releases/<slug>/ from validated renders,
// the script social copy and EN subtitles. Idempotent — running twice simply
// overwrites. Text artifacts are committed to the workspace git (T-07);
// binaries stay out via .gitignore (D-11).
package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/workspace"
)

type ReleaseBuilder struct {
	queries *sqlc.Queries
	dataDir string
}

func NewReleaseBuilder(queries *sqlc.Queries, dataDir string) *ReleaseBuilder {
	return &ReleaseBuilder{queries: queries, dataDir: dataDir}
}

func (b *ReleaseBuilder) workspace(slug string) string {
	return filepath.Join(b.dataDir, "videos", slug)
}

// Build assembles the canonical release layout for one video.
func (b *ReleaseBuilder) Build(ctx context.Context, videoID uuid.UUID) ([]string, error) {
	video, err := b.queries.GetVideo(ctx, videoID)
	if err != nil {
		return nil, fmt.Errorf("load video: %w", err)
	}
	if videostate.State(video.Status) != videostate.StateFinalReview {
		return nil, fmt.Errorf("video is %s; release build requires final_review", video.Status)
	}

	root := b.workspace(video.Slug)
	rel := func(parts ...string) string {
		return filepath.Join(root, filepath.Join(parts...))
	}
	generated := []string{}

	copyFile := func(srcRel, dstRel string) error {
		data, err := os.ReadFile(rel(srcRel))
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(rel(dstRel)), 0o755); err != nil {
			return err
		}
		return os.WriteFile(rel(dstRel), data, 0o644)
	}

	scriptRaw, err := os.ReadFile(rel("script.json"))
	if err != nil {
		return nil, fmt.Errorf("read script.json: %w", err)
	}
	var script struct {
		Post   string `json:"post"`
		Target struct {
			DurationMin int `json:"durationMin"`
		} `json:"target"`
		Social *struct {
			XThread         []string `json:"x_thread"`
			LinkedIn        string   `json:"linkedin"`
			InstagramCaption string  `json:"instagram_caption"`
		} `json:"social"`
		Segments []struct {
			ID           string `json:"id"`
			NarrationPt  string `json:"narration_pt"`
		} `json:"segments"`
	}
	if err := json.Unmarshal(scriptRaw, &script); err != nil {
		return nil, fmt.Errorf("parse script.json: %w", err)
	}

	// ---- youtube/ ----
	if err := copyFile("renders/long.mp4", "releases/youtube/video.mp4"); err != nil {
		return nil, fmt.Errorf("copy long render: %w", err)
	}
	generated = append(generated, "releases/youtube/video.mp4")

	thumbBytes, thumbErr := extractThumbnailFrame(b.ffmpegPath(), rel("renders/long.mp4"), hookSeconds(script.Segments))
	if thumbErr != nil {
		return nil, fmt.Errorf("thumbnail (ffmpeg): %w", thumbErr)
	}
	if err := os.WriteFile(rel("releases/youtube/thumbnail.jpg"), thumbBytes, 0o644); err != nil {
		return nil, err
	}
	generated = append(generated, "releases/youtube/thumbnail.jpg")

	metadata := map[string]any{
		"title":       video.Title,
		"description": fmt.Sprintf("Versão em vídeo do post: %s", video.SourceUrl),
		"source_post": video.SourceUrl,
		"duration_min": script.Target.DurationMin,
	}
	writeJSON(rel("releases/youtube/metadata.json"), metadata)
	generated = append(generated, "releases/youtube/metadata.json")

	// SRT EN for the long form: all cues in segment order.
	longSRT := b.buildSRTFor(root, nil)
	os.WriteFile(rel("releases/youtube/video.srt"), []byte(longSRT), 0o644)
	generated = append(generated, "releases/youtube/video.srt")

	// ---- shorts/short-N/ ----
	for n := 1; ; n++ {
		src := fmt.Sprintf("renders/short-%d.mp4", n)
		if _, err := os.Stat(rel(src)); err != nil {
			break
		}
		dir := fmt.Sprintf("releases/shorts/short-%d", n)
		if err := copyFile(src, dir+"/video.mp4"); err != nil {
			return nil, err
		}
		generated = append(generated, dir+"/video.mp4")

		shortSegIDs := shortSegmentIDs(script.Segments, n)
		srt := b.buildSRTFor(root, shortSegIDs)
		os.WriteFile(rel(dir+"/video.srt"), []byte(srt), 0o644)
		generated = append(generated, dir+"/video.srt")

		copyJSON, _ := json.MarshalIndent(map[string]any{
			"short_number": n,
			"cta":          "Post completo na bio",
		}, "", "  ")
		os.WriteFile(rel(dir+"/copy.json"), copyJSON, 0o644)
		generated = append(generated, dir+"/copy.json")

		if err := b.queries.UpsertChecklistItem(ctx, sqlc.UpsertChecklistItemParams{
			VideoID:      videoID,
			ItemKey:      fmt.Sprintf("short-%d", n),
			Label:        fmt.Sprintf("Short %d", n),
			DownloadPath: fmt.Sprintf("releases/shorts/short-%d/video.mp4", n),
		}); err != nil {
			return nil, err
		}
	}

	// ---- social texts ----
	if script.Social != nil {
		os.MkdirAll(rel("releases/x"), 0o755)
		thread := formatThread(script.Social.XThread)
		os.WriteFile(rel("releases/x/thread.md"), []byte(thread), 0o644)
		generated = append(generated, "releases/x/thread.md")

		os.MkdirAll(rel("releases/linkedin"), 0o755)
		os.WriteFile(rel("releases/linkedin/post.md"), []byte(script.Social.LinkedIn), 0o644)
		generated = append(generated, "releases/linkedin/post.md")

		os.MkdirAll(rel("releases/instagram"), 0o755)
		os.WriteFile(rel("releases/instagram/caption.txt"), []byte(script.Social.InstagramCaption), 0o644)
		generated = append(generated, "releases/instagram/caption.txt")
	}

	// ---- checklist seeds (platform rows) ----
	checklistSeeds := []struct{ key, label, download string }{
		{"youtube", "YouTube", "releases/youtube/video.mp4"},
		{"x", "X / Twitter", "releases/x/thread.md"},
		{"linkedin", "LinkedIn", "releases/linkedin/post.md"},
		{"instagram", "Instagram", "releases/instagram/caption.txt"},
	}
	for _, seed := range checklistSeeds {
		if err := b.queries.UpsertChecklistItem(ctx, sqlc.UpsertChecklistItemParams{
			VideoID: videoID, ItemKey: seed.key,
			Label: seed.label, DownloadPath: seed.download,
		}); err != nil {
			return nil, err
		}
	}

	// Commit TEXT artifacts only (binaries ignored by the workspace gitignore).
	if err := workspace.Commit(root, fmt.Sprintf("release(%s): build v1", video.Slug)); err != nil {
		return nil, fmt.Errorf("workspace commit: %w", err)
	}

	return generated, nil
}

func (b *ReleaseBuilder) buildSRTFor(root string, onlySegmentIDs []string) string {
	var filter map[string]bool // nil = keep all segments
	if onlySegmentIDs != nil {
		filter = map[string]bool{}
		for _, id := range onlySegmentIDs {
			filter[id] = true
		}
	}
	timelinesDir := filepath.Join(root, "timelines")
	entries, _ := os.ReadDir(timelinesDir)
	var cues []SRTCue
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".subtitles.en.json") && name != "subtitles.en.json" {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(timelinesDir, name))
		if err != nil {
			continue
		}
		var track SubtitleTrackJSON
		if json.Unmarshal(raw, &track) != nil {
			continue
		}
		if filter != nil && !filter[track.SegmentID] {
			continue
		}
		cues = append(cues, TrackToCues(track)...)
	}
	return CuesToSRT(cues)
}

func shortSegmentIDs(segments []struct {
	ID          string `json:"id"`
	NarrationPt string `json:"narration_pt"`
}, n int) []string {
	marker := fmt.Sprintf("[SHORT#%d]", n)
	var ids []string
	for _, s := range segments {
		if strings.Contains(s.NarrationPt, marker) {
			ids = append(ids, s.ID)
		}
	}
	return ids
}

func formatThread(tweets []string) string {
	var b strings.Builder
	total := len(tweets)
	for i, t := range tweets {
		b.WriteString(fmt.Sprintf("%d/%d\n%s\n\n", i+1, total, strings.TrimSpace(t)))
	}
	return strings.TrimRight(b.String(), "\n") + "\n"
}

func hookSeconds(segments []struct {
	ID          string `json:"id"`
	NarrationPt string `json:"narration_pt"`
}) float64 {
	_ = segments
	return 3.0 // hook frame ~3s into the video; refined per-timeline later
}

// extractThumbnailFrame shells out to ffmpeg. The binary is resolved through
// PATH so tests can inject a fake implementation.
func extractThumbnailFrame(ffmpegPath, videoPath string, atSeconds float64) ([]byte, error) {
	if ffmpegPath == "" {
		return nil, fmt.Errorf("ffmpeg not found on PATH")
	}
	tmp, err := os.CreateTemp("", "thumb-*.jpg")
	if err != nil {
		return nil, err
	}
	tmp.Close()
	defer os.Remove(tmp.Name())

	cmd := exec.Command(ffmpegPath,
		"-y", "-ss", fmt.Sprintf("%.2f", atSeconds),
		"-i", videoPath, "-frames:v", "1", tmp.Name())
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return os.ReadFile(tmp.Name())
}

func (b *ReleaseBuilder) ffmpegPath() string {
	p, err := exec.LookPath("ffmpeg")
	if err != nil {
		return ""
	}
	return p
}

func writeJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

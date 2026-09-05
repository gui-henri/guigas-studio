//go:build integration

package timeline

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/gui-henri/guigas-studio/backend/internal/database"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/testutil"
	"github.com/gui-henri/guigas-studio/backend/internal/workspace"
)

type noopHub struct{}

func (noopHub) PublishJSON(string, map[string]any) {}

func writeSegmentArtifacts(t *testing.T, root, segmentID string, jawOpen float64, samples int) {
	t.Helper()
	audioDir := filepath.Join(root, "audio")
	if err := os.MkdirAll(audioDir, 0o755); err != nil {
		t.Fatal(err)
	}

	names := []string{"_neutral", "jawOpen", "mouthSmileLeft"}
	rows := "["
	for i := 0; i < samples; i++ {
		if i > 0 {
			rows += ","
		}
		t := i * 100
		vals := fmt.Sprintf("%d,0,%g,%g", t, jawOpen, jawOpen/4)
		rows += "[" + vals + "]"
	}
	rows += "]"

	bsBody := fmt.Sprintf(`{"version":1,"approx_fps":10,"names":%s,"samples":%s,"state_changes":[]}`,
		mustJSON(names), rows)
	if err := os.WriteFile(filepath.Join(audioDir, segmentID+".blendshapes.json"), []byte(bsBody), 0o644); err != nil {
		t.Fatal(err)
	}

	visemes := `{"wav_sha256":"abc","cues":[{"shape":"A","start_ms":0,"end_ms":400},{"shape":"X","start_ms":400,"end_ms":900}]}`
	if err := os.WriteFile(filepath.Join(audioDir, segmentID+".visemes.json"), []byte(visemes), 0o644); err != nil {
		t.Fatal(err)
	}
}

func mustJSON(v any) string {
	b, _ := jsonMarshal(v)
	return string(b)
}

func TestTimelineServiceFlow(t *testing.T) {
	ctx := context.Background()
	url := testutil.DatabaseURL(t, "timeline")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set; skipping integration test")
	}
	db, err := database.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	if _, err := db.Pool.Exec(ctx,
		`TRUNCATE takes, video_artifact_parses, video_status_history, rss_items, videos, users CASCADE`); err != nil {
		t.Fatal(err)
	}

	dataDir := t.TempDir()
	slug := "timeline-demo"
	root := filepath.Join(dataDir, "videos", slug)
	if _, err := workspace.Scaffold(dataDir, slug, []byte("# x")); err != nil {
		t.Fatal(err)
	}

	video, err := db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{Slug: slug, Title: "T"})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID: video.ID, Status: string(videostate.StateVoiceProcess),
	}); err != nil {
		t.Fatal(err)
	}

	// Script with two segments; artifacts present for both.
	script := `{"post":"t","segments":[{"id":"seg-a"},{"id":"seg-b"}]}`
	if err := os.WriteFile(filepath.Join(root, "script.json"), []byte(script), 0o644); err != nil {
		t.Fatal(err)
	}
	writeSegmentArtifacts(t, root, "seg-a", 0.8, 5)
	writeSegmentArtifacts(t, root, "seg-b", 0.0, 5)

	svc := NewService(db.Queries, dataDir, noopHub{})
	svc.Run(ctx, slug)

	// Both timelines written and protojson-parseable.
	for _, seg := range []string{"seg-a", "seg-b"} {
		body, rerr := os.ReadFile(filepath.Join(root, "timelines", seg+".timeline.json"))
		if rerr != nil {
			t.Fatalf("timeline %s missing: %v", seg, rerr)
		}
		if !jsonValid(body) {
			t.Errorf("timeline %s is not valid JSON", seg)
		}
	}

	v, _ := db.Queries.GetVideoBySlug(ctx, slug)
	if v.Status != string(videostate.StateScenesPending) {
		t.Fatalf("status = %q, want scenes_pending", v.Status)
	}

	// Idempotent re-run: no state churn.
	svc.Run(ctx, slug)
	v2, _ := db.Queries.GetVideoBySlug(ctx, slug)
	if v2.Status != string(videostate.StateScenesPending) {
		t.Errorf("re-run changed status to %q", v2.Status)
	}
	history, _ := db.Queries.ListStatusHistoryByVideo(ctx, video.ID)
	scenesCount := 0
	for _, h := range history {
		if h.Status == string(videostate.StateScenesPending) {
			scenesCount++
		}
	}
	if scenesCount != 1 {
		t.Errorf("scenes_pending history entries = %d, want exactly 1", scenesCount)
	}
}

func TestTimelinePartialFailureBlocks(t *testing.T) {
	ctx := context.Background()
	url := testutil.DatabaseURL(t, "timeline")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set; skipping integration test")
	}
	db, err := database.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Pool.Close()
	if _, err := db.Pool.Exec(ctx,
		`TRUNCATE takes, video_artifact_parses, video_status_history, rss_items, videos, users CASCADE`); err != nil {
		t.Fatal(err)
	}

	dataDir := t.TempDir()
	slug := "timeline-blocked"
	root := filepath.Join(dataDir, "videos", slug)
	if _, err := workspace.Scaffold(dataDir, slug, []byte("# x")); err != nil {
		t.Fatal(err)
	}
	video, err := db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{Slug: slug, Title: "B"})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID: video.ID, Status: string(videostate.StateVoiceProcess),
	}); err != nil {
		t.Fatal(err)
	}
	script := `{"post":"b","segments":[{"id":"ok-seg"},{"id":"broken-seg"}]}`
	if err := os.WriteFile(filepath.Join(root, "script.json"), []byte(script), 0o644); err != nil {
		t.Fatal(err)
	}
	// Artifacts only for ok-seg; broken-seg has no visemes sidecar.
	writeSegmentArtifacts(t, root, "ok-seg", 0.8, 3)

	svc := NewService(db.Queries, dataDir, noopHub{})
	svc.Run(ctx, slug)

	v, gErr := db.Queries.GetVideoBySlug(ctx, slug)
	if gErr != nil || v.Status != string(videostate.StateBlocked) {
		t.Fatalf("status = %q (%v), want blocked", v.Status, gErr)
	}
	if _, statErr := os.Stat(filepath.Join(root, "timelines", "ok-seg.timeline.json")); statErr != nil {
		t.Error("ok-seg timeline should exist before the failure")
	}
	history, hErr := db.Queries.ListStatusHistoryByVideo(ctx, video.ID)
	foundReason := false
	if hErr == nil {
		for _, h := range history {
			if stringsContains(h.Reason, "segment broken-seg") && h.Status == string(videostate.StateBlocked) {
				foundReason = true
			}
		}
	}
	if !foundReason {
		t.Error("blocked reason not recorded in history")
	}
}

func TestTimelineServiceAutoGeneratesVisemesFallback(t *testing.T) {
	ctx := context.Background()
	url := testutil.DatabaseURL(t, "timeline")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set; skipping integration test")
	}
	db, err := database.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	if _, err := db.Pool.Exec(ctx,
		`TRUNCATE takes, video_artifact_parses, video_status_history, rss_items, videos, users CASCADE`); err != nil {
		t.Fatal(err)
	}

	dataDir := t.TempDir()
	slug := "timeline-fallback-demo"
	root := filepath.Join(dataDir, "videos", slug)
	if _, err := workspace.Scaffold(dataDir, slug, []byte("# x")); err != nil {
		t.Fatal(err)
	}

	video, err := db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{Slug: slug, Title: "Fallback"})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID: video.ID, Status: string(videostate.StateVoiceProcess),
	}); err != nil {
		t.Fatal(err)
	}

	script := `{"post":"f","segments":[{"id":"seg-auto"}]}`
	if err := os.WriteFile(filepath.Join(root, "script.json"), []byte(script), 0o644); err != nil {
		t.Fatal(err)
	}

	audioDir := filepath.Join(root, "audio")
	_ = os.MkdirAll(audioDir, 0o755)

	// Write blendshapes and wav, but purposely DO NOT write .visemes.json
	bs := `{"version":1,"approx_fps":10,"names":["_neutral","jawOpen"],"samples":[[0,0,0],[100,0,0.5]],"state_changes":[]}`
	if err := os.WriteFile(filepath.Join(audioDir, "seg-auto.blendshapes.json"), []byte(bs), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(audioDir, "seg-auto.wav"), []byte("RIFFfakeaudio"), 0o644); err != nil {
		t.Fatal(err)
	}

	svc := NewService(db.Queries, dataDir, noopHub{})
	svc.Run(ctx, slug)

	// Verify fallback sidecar and timeline were generated
	if _, err := os.Stat(filepath.Join(audioDir, "seg-auto.visemes.json")); err != nil {
		t.Fatalf("seg-auto.visemes.json was not generated: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "timelines", "seg-auto.timeline.json")); err != nil {
		t.Fatalf("seg-auto.timeline.json was not generated: %v", err)
	}

	v, _ := db.Queries.GetVideoBySlug(ctx, slug)
	if v.Status != string(videostate.StateScenesPending) {
		t.Fatalf("status = %q, want scenes_pending", v.Status)
	}
}

func jsonValid(b []byte) bool {
	var m map[string]any
	return jsonUnmarshalInto(b, &m) == nil
}

func stringsContains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func jsonMarshal(v any) ([]byte, error)       { return json.Marshal(v) }
func jsonUnmarshalInto(b []byte, t any) error { return json.Unmarshal(b, t) }

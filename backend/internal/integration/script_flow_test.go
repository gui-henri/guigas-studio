//go:build integration

// End-to-end regression for the script flow (Sprint 1):
// RSS fixture → watcher → context pack → observer → UpdateScript → ApproveScript,
// plus the invalid-script negative case.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://studio:studio@localhost:5432/studio_test?sslmode=disable" \
//	  go test -tags=integration -v ./internal/integration/
package integration

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"

	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"

	"github.com/google/uuid"
	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/gui-henri/guigas-studio/backend/internal/artifacts"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/gui-henri/guigas-studio/backend/internal/database"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/services"
	"github.com/gui-henri/guigas-studio/backend/internal/watcher"
)

const validScriptTpl = `{
  "post": "%s",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 8 },
  "segments": [
    { "id": "hook", "beat": "BEAT_HOOK", "emotion": "EMOTION_SURPRISED",
      "narration_pt": "Gancho do %s." },
    { "id": "cta", "beat": "BEAT_CTA", "emotion": "EMOTION_IDLE",
      "narration_pt": "CTA final." }
  ]
}`

const invalidScript = `{
  "post": "broken",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 8 },
  "segments": [
    { "id": "a", "beat": "BEAT_ABERTURA", "emotion": "EMOTION_IDLE", "narration_pt": "x" },
    { "id": "b", "beat": "BEAT_HOOK", "emotion": "EMOTION_IDLE", "narration_pt": "y",
      "short": { "id": 7, "hook": "", "cta": "" } },
    { "id": "c", "beat": "BEAT_CTA", "emotion": "EMOTION_IDLE", "narration_pt": "z",
      "short": { "id": 3, "hook": "h", "cta": "c" } }
  ]
}`

// recordingPublisher captures published events for asserts.
type recordingPublisher struct {
	mu     sync.Mutex
	events []string
}

func (r *recordingPublisher) PublishScriptValidated(videoID, slug string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, slug)
}

func (r *recordingPublisher) PublishScenesValidated(videoID, slug string, valid bool) {}

func (r *recordingPublisher) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.events)
}

func rssFeed(guidSuffix string, slugs []string) string {
	var items strings.Builder
	for _, s := range slugs {
		fmt.Fprintf(&items, `
    <item>
      <guid>tag:test,%s:%s</guid>
      <title>%s</title>
      <link>https://blog.example.com/%s</link>
    </item>`, guidSuffix, s, s, s)
	}
	return fmt.Sprintf(`<?xml version="1.0"?><rss version="2.0"><channel>
    <title>T</title><link>https://blog.example.com</link><description>d</description>%s
  </channel></rss>`, items.String())
}

func waitFor(t *testing.T, timeout time.Duration, what string, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if check() {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("timeout waiting for %s", what)
}

func protojsonUnmarshal(data string, msg *studiov1.StudioScript) error {
	return protojson.UnmarshalOptions{DiscardUnknown: false}.Unmarshal([]byte(data), msg)
}

func TestScriptFlowEndToEnd(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = os.Getenv("STUDIO_TEST_DATABASE_URL")
	}
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}
	ctx := context.Background()
	runID := time.Now().UTC().Format("20060102T150405")
	slugs := []string{"e2e-base-" + runID, "e2e-good-" + runID, "e2e-bad-" + runID}
	guidSuffix := runID

	db, err := database.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	if _, err := db.Pool.Exec(ctx,
		`TRUNCATE video_artifact_parses, video_status_history, rss_items, videos, users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	dataDir := t.TempDir()

	pub := &recordingPublisher{}
	logger := slog.Default()
	observer := artifacts.NewObserver(filepath.Join(dataDir, "videos"), db.Queries, pub, logger)
	obsCtx, cancelObs := context.WithCancel(ctx)
	defer cancelObs()
	go func() {
		_ = observer.Run(obsCtx)
	}()

	mux := new(http.ServeMux)
	mux.Handle(studiov1connect.NewVideoServiceHandler(services.NewVideoService(db.Queries, dataDir, nil, db.Pool)))
	apiSrv := httptest.NewServer(mux)
	defer apiSrv.Close()
	videoSvc := studiov1connect.NewVideoServiceClient(apiSrv.Client(), apiSrv.URL)

	// --- Case 1 (positive): full happy path -------------------------------

	// Baseline poll marks both GUIDs without creating videos.
	feedBody := rssFeed(guidSuffix, slugs[:1])
	feed := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(feedBody))
	}))
	baseWatcher := watcher.New(db.Queries, watcher.Config{URL: feed.URL, Interval: time.Minute, DataDir: dataDir}, logger)
	if _, err := baseWatcher.Poll(ctx); err != nil {
		t.Fatalf("baseline poll: %v", err)
	}

	// Second poll introduces two new posts → scaffold + script_pending each.
	feed2 := rssFeed(guidSuffix, slugs)
	feed2Srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(feed2))
	}))
	grownWatcher := watcher.New(db.Queries, watcher.Config{URL: feed2Srv.URL, Interval: time.Minute, DataDir: dataDir}, logger)
	if _, err := grownWatcher.Poll(ctx); err != nil {
		t.Fatalf("poll new item: %v", err)
	}

	slug := strings.ToLower(slugs[1]) // first NEW item; watcher slugifies to lowercase
	badSlugLower := strings.ToLower(slugs[2])
	root := filepath.Join(dataDir, "videos", slug)

	var videoID uuid.UUID
	waitFor(t, 5*time.Second, "video creation by watcher", func() bool {
		v, err := db.Queries.GetVideoBySlug(ctx, slug)
		if err != nil {
			return false
		}
		videoID = v.ID
		return v.Status == string(videostate.StateScriptPending)
	})
	for _, rel := range []string{"context/AGENTS.md", "context/post.md"} {
		if _, err := os.Stat(filepath.Join(root, rel)); err != nil {
			t.Fatalf("context pack missing %s", rel)
		}
	}

	// Agent writes a valid script.json → observer transitions to script_review.
	scriptPath := filepath.Join(root, "script.json")
	if err := os.WriteFile(scriptPath, []byte(fmt.Sprintf(validScriptTpl, slug, slug)), 0o644); err != nil {
		t.Fatalf("write valid script: %v", err)
	}
	waitFor(t, 8*time.Second, "script_review transition", func() bool {
		v, err := db.Queries.GetVideo(ctx, videoID)
		return err == nil && v.Status == string(videostate.StateScriptReview)
	})
	waitFor(t, 3*time.Second, "publisher notification", func() bool {
		return pub.count() > 0
	})

	// UpdateScript edits narration through the real service.
	edited := strings.Replace(fmt.Sprintf(validScriptTpl, slug, slug),
		fmt.Sprintf("Gancho do %s.", slug), "Gancho editado pela UI.", 1)
	scriptMsg := &studiov1.StudioScript{}
	if err := protojsonUnmarshal(edited, scriptMsg); err != nil {
		t.Fatalf("parse edited: %v", err)
	}
	upd, uErr := videoSvc.UpdateScript(ctx, connect.NewRequest(&studiov1.UpdateScriptRequest{
		VideoId: videoID.String(),
		Script:  scriptMsg,
	}))
	if uErr != nil {
		t.Fatalf("UpdateScript: %v", uErr)
	}
	if len(upd.Msg.GetErrors()) > 0 {
		t.Fatalf("UpdateScript rejected: %v", upd.Msg.GetErrors())
	}
	raw, _ := os.ReadFile(scriptPath)
	if !bytes.Contains(raw, []byte("Gancho editado pela UI.")) {
		t.Error("edit not persisted to disk")
	}
	gitOut, gErr := exec.Command("git", "-C", root, "log", "--oneline").CombinedOutput()
	if gErr != nil || !strings.Contains(string(gitOut), "update script via ui") {
		t.Errorf("missing UI commit in workspace git: %s (%v)", gitOut, gErr)
	}

	// ApproveScript completes the flow.
	if _, err := videoSvc.ApproveScript(ctx, connect.NewRequest(&studiov1.ApproveScriptRequest{
		VideoId: videoID.String(),
	})); err != nil {
		t.Fatalf("ApproveScript: %v", err)
	}
	final, err := db.Queries.GetVideo(ctx, videoID)
	if err != nil || final.Status != string(videostate.StateScriptApproved) {
		t.Fatalf("final status = %q (%v), want script_approved", final.Status, err)
	}
	history, hErr := db.Queries.ListStatusHistoryByVideo(ctx, videoID)
	if hErr != nil || len(history) < 2 {
		t.Fatalf("history entries = %d (%v), want >= 2", len(history), hErr)
	}

	// --- Case 2 (negative): invalid script stagnates safely ---------------

	badSlug := badSlugLower
	var badID uuid.UUID
	waitFor(t, 5*time.Second, "negative-case video creation", func() bool {
		v, err := db.Queries.GetVideoBySlug(ctx, badSlug)
		if err != nil {
			return false
		}
		badID = v.ID
		return v.Status == string(videostate.StateScriptPending)
	})

	badPath := filepath.Join(dataDir, "videos", badSlug, "script.json")
	if err := os.WriteFile(badPath, []byte(invalidScript), 0o644); err != nil {
		t.Fatalf("write invalid script: %v", err)
	}
	time.Sleep(1500 * time.Millisecond) // debounce + processing window

	v, gErr := db.Queries.GetVideo(ctx, badID)
	if gErr != nil || v.Status != string(videostate.StateScriptPending) {
		t.Fatalf("invalid script changed status: %q (%v)", v.Status, gErr)
	}
	parses, pErr := db.Queries.ListParsesByVideo(ctx, badID)
	if pErr != nil || len(parses) == 0 || parses[0].Valid {
		t.Fatalf("invalid parse not recorded correctly: n=%d (%v)", len(parses), pErr)
	}
	if !bytes.Contains(parses[0].Errors, []byte("BEAT_ABERTURA")) {
		t.Errorf("recorded errors missing schema detail: %s", parses[0].Errors)
	}
}

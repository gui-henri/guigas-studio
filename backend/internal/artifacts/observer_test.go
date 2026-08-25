package artifacts

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

func TestDebouncerCoalescesBursts(t *testing.T) {
	var mu sync.Mutex
	fired := make(map[string]int)
	d := newDebouncer(40*time.Millisecond, func(path string) {
		mu.Lock()
		fired[path]++
		mu.Unlock()
	})

	const burst = 20
	for range burst {
		d.trigger("/data/videos/demo/script.json")
		time.Sleep(time.Millisecond) // simulate rapid successive events
	}

	// Wait well past the debounce window.
	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if got := fired["/data/videos/demo/script.json"]; got != 1 {
		t.Errorf("burst of %d events fired %d times, want exactly 1", burst, got)
	}
	if len(d.timers) != 0 {
		t.Errorf("%d timers leaked", len(d.timers))
	}
}

func TestDebouncerIndependentPaths(t *testing.T) {
	var mu sync.Mutex
	count := 0
	d := newDebouncer(30*time.Millisecond, func(string) {
		mu.Lock()
		count++
		mu.Unlock()
	})
	d.trigger("/a/script.json")
	d.trigger("/b/script.json")
	time.Sleep(150 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()
	if count != 2 {
		t.Errorf("fired %d times across 2 paths, want 2", count)
	}
}

// fakePublisher records PublishScriptValidated calls.
type fakePublisher struct {
	mu     sync.Mutex
	called []string // "videoID|slug"
}

func (f *fakePublisher) PublishScriptValidated(videoID, slug string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.called = append(f.called, videoID+"|"+slug)
}

func (f *fakePublisher) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.called)
}

const validScriptJSON = `{
  "post": "demo-post",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 8 },
  "segments": [
    { "id": "hook", "beat": "BEAT_HOOK", "emotion": "EMOTION_SURPRISED",
      "narration_pt": "Gancho do demo." },
    { "id": "cta", "beat": "BEAT_CTA", "emotion": "EMOTION_IDLE",
      "narration_pt": "CTA do demo." }
  ]
}`

func TestObserverFlow(t *testing.T) {
	url := os.Getenv("STUDIO_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set; skipping integration test")
	}
	ctx := context.Background()

	db, err := connectTestDB(t)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	truncatePipeline(t, ctx, db.Pool)

	video, err := db.Queries.CreateVideo(ctx, newDemoVideoParams("observer-demo"))
	if err != nil {
		t.Fatalf("create video: %v", err)
	}
	// Realistic precondition: S1-01 scaffolding already moved it to script_pending.
	if err := db.Queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID:     video.ID,
		Status: "script_pending",
	}); err != nil {
		t.Fatalf("seed status: %v", err)
	}

	root := t.TempDir() + "/videos"
	wsDir := filepath.Join(root, "observer-demo")
	if err := os.MkdirAll(wsDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	scriptPath := filepath.Join(wsDir, ScriptFileName)

	pub := &fakePublisher{}
	o := NewObserver(root, db.Queries, pub, slog.Default())

	// 1. Invalid script: parse recorded as invalid, status unchanged, no publish.
	if err := os.WriteFile(scriptPath, []byte(`{"quebrado": true}`), 0o644); err != nil {
		t.Fatalf("write invalid: %v", err)
	}
	o.ProcessScriptPath(ctx, scriptPath)

	assertParse(t, ctx, db, video.ID, false)
	assertStatus(t, ctx, db, video.ID, "script_pending")
	if pub.count() != 0 {
		t.Fatalf("publisher must not fire on invalid script")
	}

	// 2. Valid script: transition to script_review, parse valid, publish once.
	if err := os.WriteFile(scriptPath, []byte(validScriptJSON), 0o644); err != nil {
		t.Fatalf("write valid: %v", err)
	}
	o.ProcessScriptPath(ctx, scriptPath)

	assertParse(t, ctx, db, video.ID, true)
	assertStatus(t, ctx, db, video.ID, "script_review")
	if pub.count() != 1 {
		t.Fatalf("publisher called %d times, want 1", pub.count())
	}

	// 3. Rewrite while in script_review: re-validated and recorded, but the
	// repeated transition is refused by videostate and silently skipped.
	if err := os.WriteFile(scriptPath, []byte(validScriptJSON), 0o644); err != nil {
		t.Fatalf("rewrite valid: %v", err)
	}
	o.ProcessScriptPath(ctx, scriptPath)

	assertStatus(t, ctx, db, video.ID, "script_review") // unchanged
	if pub.count() != 1 {
		t.Errorf("publisher called %d times after rewrite, want still 1", pub.count())
	}

	parses, err := db.Queries.ListParsesByVideo(ctx, video.ID)
	if err != nil {
		t.Fatalf("list parses: %v", err)
	}
	if len(parses) != 3 {
		t.Errorf("recorded %d parses, want 3 (invalid, valid, rewrite)", len(parses))
	}
}

package watcher

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"

	"github.com/gui-henri/guigas-studio/backend/internal/database"
)

// TestScaffoldPipelineE2E covers S1-01 acceptance end to end:
// RSS post → workspace tree → new → script_pending → workspace git commit.
func TestScaffoldPipelineE2E(t *testing.T) {
	url := os.Getenv("STUDIO_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set; skipping integration test")
	}
	dataDir := t.TempDir()

	extra := `<item><guid>tag:blog.example.com,2026:post-workspace</guid>` +
		`<title>Post Com Workspace</title>` +
		`<link>https://blog.example.com/2026/08/post-com-workspace</link></item>`

	var pollCount int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		pollCount++
		body := feedXML
		if pollCount > 1 {
			body = strings.Replace(feedXML, "</channel>", extra+"</channel>", 1)
		}
		_, _ = w.Write([]byte(body))
	}))
	defer srv.Close()

	db, err := database.Connect(t.Context(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	if _, err := db.Pool.Exec(t.Context(), `TRUNCATE rss_items, videos CASCADE`); err != nil {
		t.Fatalf("clean tables: %v", err)
	}

	w := New(db.Queries, Config{URL: srv.URL, Interval: minute(), DataDir: dataDir}, slog.Default())

	// Baseline poll first (marks existing GUIDs without videos).
	if _, err := w.Poll(t.Context()); err != nil {
		t.Fatalf("baseline poll: %v", err)
	}

	// Second poll brings the new post (feed changes after first request).
	if _, err := w.Poll(t.Context()); err != nil {
		t.Fatalf("poll: %v", err)
	}

	slug := "post-com-workspace"
	root := dataDir + "/videos/" + slug

	for _, rel := range []string{
		"context/AGENTS.md",
		"context/post.md",
		"context/method/beats.md",
	} {
		if _, err := os.Stat(root + "/" + rel); err != nil {
			t.Errorf("missing %s after scaffold", rel)
		}
	}

	var status string
	if err := db.Pool.QueryRow(t.Context(),
		`SELECT status FROM videos WHERE slug = $1`, slug).Scan(&status); err != nil {
		t.Fatalf("query video: %v", err)
	}
	if status != "script_pending" {
		t.Errorf("status = %q, want script_pending", status)
	}

	out, err := exec.Command("git", "-C", root, "log", "--oneline", "-1").CombinedOutput()
	if err != nil {
		t.Fatalf("git log in workspace: %v: %s", err, out)
	}
	if !strings.Contains(string(out), "chore("+slug+"): scaffold context pack") {
		t.Errorf("expected scaffold commit, got: %s", out)
	}
}

func minute() time.Duration { return time.Minute }

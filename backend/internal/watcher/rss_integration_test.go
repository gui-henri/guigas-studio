package watcher

import (
	"context"
	_ "embed"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gui-henri/guigas-studio/backend/internal/database"
	"github.com/gui-henri/guigas-studio/backend/internal/testutil"
)

//go:embed testdata/feed.xml
var feedXML string

func testCtx(t *testing.T) context.Context {
	return t.Context()
}

func TestBaselineThenNewItem(t *testing.T) {
	url := testutil.DatabaseURL(t, "watcher")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set; skipping integration test")
	}

	var srvURL string
	{
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(feedXML))
		}))
		t.Cleanup(srv.Close)
		srvURL = srv.URL
	}

	db, err := database.Connect(t.Context(), url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	if _, err := db.Pool.Exec(t.Context(), `TRUNCATE rss_items, videos CASCADE`); err != nil {
		t.Fatalf("clean tables: %v", err)
	}
	w := New(db.Queries, Config{URL: srvURL, Interval: time.Minute}, slog.Default())

	// 1st poll: baseline — marks GUIDs, creates no videos.
	if _, err := w.Poll(t.Context()); err != nil {
		t.Fatalf("baseline poll: %v", err)
	}
	count, err := db.Queries.CountRssItems(t.Context())
	if err != nil || count != 2 {
		t.Fatalf("rss_items = %d, %v; want 2", count, err)
	}
	videos, err := db.Queries.ListVideos(t.Context())
	if err != nil || len(videos) != 0 {
		t.Fatalf("videos after baseline = %d, %v; want 0", len(videos), err)
	}

	// 2nd poll with an extra post: exactly one video in `new`.
	extra := `<item><guid>tag:blog.example.com,2026:post-novo</guid>` +
		`<title>Post Novo Real</title>` +
		`<link>https://blog.example.com/2026/08/post-novo-real</link></item>`
	srv2 := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(strings.Replace(feedXML, "</channel>", extra+"</channel>", 1)))
	}))
	defer srv2.Close()
	w.cfg.URL = srv2.URL

	if _, err := w.Poll(t.Context()); err != nil {
		t.Fatalf("poll with new item: %v", err)
	}
	videos, err = db.Queries.ListVideos(t.Context())
	if err != nil {
		t.Fatalf("list videos: %v", err)
	}
	if len(videos) != 1 {
		t.Fatalf("videos after new post = %d, want 1", len(videos))
	}
	v := videos[0]
	if v.Status != "new" || v.Slug != "post-novo-real" || v.Title != "Post Novo Real" {
		t.Errorf("video = {%s %s %s}, want status=new slug=post-novo-real", v.Status, v.Slug, v.Title)
	}

	// 3rd poll identical to the previous: nothing new.
	if _, err := w.Poll(t.Context()); err != nil {
		t.Fatalf("re-poll: %v", err)
	}
	videos, err = db.Queries.ListVideos(t.Context())
	if err != nil || len(videos) != 1 {
		t.Fatalf("videos after re-poll = %d, %v; want 1 (dedup failed)", len(videos), err)
	}
}

package watcher

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSlugify(t *testing.T) {
	cases := []struct {
		name  string
		link  string
		title string
		want  string
	}{
		{"from url path", "https://blog.example.com/2026/08/meu-post-novo/", "", "meu-post-novo"},
		{"url with query", "https://blog.example.com/posts/outro-post?utm=x", "", "outro-post"},
		{"fallback to title", "", "Título com Acentos & Espaços!", "titulo-com-acentos-espacos"},
		{"empty both", "", "", "untitled"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Slugify(tc.link, tc.title); got != tc.want {
				t.Errorf("Slugify(%q,%q) = %q, want %q", tc.link, tc.title, got, tc.want)
			}
		})
	}
}

func newTestWatcher(t *testing.T, url string) *Watcher {
	t.Helper()
	return New(nil, Config{URL: url, Interval: time.Minute}, slog.Default())
}

func TestPollBadFeedDoesNotPanic(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	w := newTestWatcher(t, srv.URL)
	if _, err := w.Poll(testCtx(t)); err == nil {
		t.Error("expected error for non-200 feed")
	}

	broken := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("<rss><channel><item><guid>x</guid></item></rss>"))
	}))
	defer broken.Close()
	if _, err := w.Poll(testCtx(t)); err == nil {
		t.Error("expected parse error for malformed feed")
	}
}

func TestPollEmptyURLFails(t *testing.T) {
	w := newTestWatcher(t, "")
	if _, err := w.Poll(testCtx(t)); err == nil {
		t.Error("expected error for empty RSS_URL")
	}
}

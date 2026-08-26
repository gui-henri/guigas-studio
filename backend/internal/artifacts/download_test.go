//go:build integration

package artifacts

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

func acceptAll(string) (*auth.Claims, error) { return &auth.Claims{UserID: "u"}, nil }

func setupDownload(t *testing.T) (srvURL, videoID string) {
	t.Helper()
	url := os.Getenv("STUDIO_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	db, err := database.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Pool.Close)
	if _, err := db.Pool.Exec(ctx,
		`TRUNCATE takes, video_artifact_parses, video_status_history, rss_items, videos, users CASCADE`); err != nil {
		t.Fatal(err)
	}
	video, err := db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{Slug: "dl-demo", Title: "D"})
	if err != nil {
		t.Fatal(err)
	}

	dataDir := t.TempDir()
	audioDir := filepath.Join(dataDir, "videos", "dl-demo", "audio")
	if err := os.MkdirAll(audioDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(audioDir, "seg.wav"), []byte("WAVBYTES"), 0o644); err != nil {
		t.Fatal(err)
	}

	handler := NewDownloadHandler(db.Queries, dataDir, acceptAll)
	mux := new(http.ServeMux)
	mux.Handle("GET /api/v1/videos/{videoID}/artifacts/{path...}", handler)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv.URL, video.ID.String()
}

func getWithAuth(srvURL string, authz bool, path string) (*http.Response, string) {
	req, _ := http.NewRequest(http.MethodGet, srvURL+path, nil)
	if authz {
		token, _, _ := auth.IssueToken("secret-secret-secret", "u", 3600_000_000_000)
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, ""
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp, string(body)
}

func TestArtifactDownloadAuthAndSanitize(t *testing.T) {
	srvURL, videoID := setupDownload(t)

	cases := []struct {
		name   string
		auth   bool
		path   string
		status int
	}{
		{"no bearer -> 401", false,
			fmt.Sprintf("/api/v1/videos/%s/artifacts/audio/seg.wav", videoID), 401},
		{"valid wav streams", true,
			fmt.Sprintf("/api/v1/videos/%s/artifacts/audio/seg.wav", videoID), 200},
		{"traversal rejected (client follows mux clean -> 404)", true,
			fmt.Sprintf("/api/v1/videos/%s/artifacts/audio/../timelines/x.json", videoID), 404},
		{"absolute path rejected", true,
			fmt.Sprintf("/api/v1/videos/%s/artifacts//etc/passwd", videoID), 400},
		{"extension not allowed", true,
			fmt.Sprintf("/api/v1/videos/%s/artifacts/audio/seg.exe", videoID), 400},
		{"dir not allowed", true,
			fmt.Sprintf("/api/v1/videos/%s/artifacts/renders/out.mp4", videoID), 400},
		{"missing file -> 404", true,
			fmt.Sprintf("/api/v1/videos/%s/artifacts/audio/nope.wav", videoID), 404},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, body := getWithAuth(srvURL, tc.auth, tc.path)
			if resp == nil {
				t.Fatal("no response")
			}
			if resp.StatusCode != tc.status {
				t.Errorf("status = %d (%s), want %d", resp.StatusCode, body, tc.status)
			}
			if tc.status == 200 && body != "WAVBYTES" {
				t.Errorf("streamed body = %q", body)
			}
		})
	}
}

// Pure sanitizer coverage (the HTTP layer may normalize paths before us).
func TestSanitizeArtifactPath(t *testing.T) {
	ok := []string{"audio/seg.wav", "timelines/seg.timeline.json", "assets/sprite.png"}
	for _, p := range ok {
		if _, err := sanitizeArtifactPath(p); err != nil {
			t.Errorf("path %q rejected: %v", p, err)
		}
	}
	bad := []string{
		"", "/etc/passwd", "..", "audio/../x.wav", "audio\\seg.wav",
		"audio/sub/dir/x.wav", "renders/out.mp4", "audio/seg.exe", "audio/",
	}
	for _, p := range bad {
		if _, err := sanitizeArtifactPath(p); err == nil {
			t.Errorf("path %q accepted, want rejection", p)
		}
	}
}

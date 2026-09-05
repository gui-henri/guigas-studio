package artifacts

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gui-henri/guigas-studio/backend/internal/auth"
)

func filesTestSetup(t *testing.T) (string, string) {
	t.Helper()
	root := t.TempDir()
	ws := filepath.Join(root, "demo")
	if err := os.MkdirAll(filepath.Join(ws, "timelines"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ws, "script.json"), []byte(`{"post":"x"}`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ws, "timelines", "hook.timeline.json"), []byte(`{"v":1}`), 0o644); err != nil {
		t.Fatal(err)
	}
	return root, ws
}

func TestFilesHandlerAuthMatrix(t *testing.T) {
	t.Setenv("RUNNER_TOKEN", "pat-123")
	root, _ := filesTestSetup(t)
	handler := NewFilesHandler(root, "secret")

	newReq := func(target, token string) *http.Request {
		r := httptest.NewRequest("GET", target, nil)
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		r.SetPathValue("slug", "demo")
		r.SetPathValue("path", strings.TrimPrefix(r.URL.Path, "/api/v1/videos/demo/files/"))
		return r
	}

	token, _, err := auth.IssueToken("secret", "user", 3600_000_000_000)
	if err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name string
		req  *http.Request
		want int
	}{
		{"anonymous → 401", newReq("/api/v1/videos/demo/files/script.json", ""), http.StatusUnauthorized},
		{"wrong pat → 401", newReq("/api/v1/videos/demo/files/script.json", "nope"), http.StatusUnauthorized},
		{"valid pat → 200", newReq("/api/v1/videos/demo/files/script.json", "pat-123"), http.StatusOK},
	}
	jwtTok, _, jErr := auth.IssueToken("secret", "u", 3600e9)
	if jErr != nil {
		t.Fatal(jErr)
	}
	cases = append(cases,
		struct{ name string; req *http.Request; want int }{"valid jwt → 200", newReq("/api/v1/videos/demo/files/script.json", jwtTok), http.StatusOK},
		struct{ name string; req *http.Request; want int }{"valid query token → 200", newReq("/api/v1/videos/demo/files/script.json?token="+jwtTok, ""), http.StatusOK},
	)

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, tc.req)
			if rec.Code != tc.want {
				t.Fatalf("code=%d want=%d body=%s", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
	_ = token
}

func TestFilesHandlerServesAndGuards(t *testing.T) {
	t.Setenv("RUNNER_TOKEN", "pat-123")
	root, ws := filesTestSetup(t)
	handler := NewFilesHandler(root, "secret")

	get := func(target string) int {
		r := httptest.NewRequest("GET", target, nil)
		r.Header.Set("Authorization", "Bearer pat-123")
		r.SetPathValue("slug", "demo")
		r.SetPathValue("path", strings.TrimPrefix(target, "/api/v1/videos/demo/files/"))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, r)
		return rec.Code
	}

	if code := get("/api/v1/videos/demo/files/script.json"); code != http.StatusOK {
		t.Fatalf("script.json: %d", code)
	}
	if code := get("/api/v1/videos/demo/files/timelines/hook.timeline.json"); code != http.StatusOK {
		t.Fatalf("timeline: %d", code)
	}
	// Traversal attempts are rejected.
	if code := get("/api/v1/videos/demo/files/../../secrets.env"); code == http.StatusOK {
		t.Fatal("traversal escaped workspace")
	}
	// Missing file → 404.
	if code := get("/api/v1/videos/demo/files/audio/nope.wav"); code != http.StatusNotFound {
		t.Fatalf("missing: %d", code)
	}
	_ = ws
}

func TestBuildManifestAllowlist(t *testing.T) {
	root, ws := filesTestSetup(t)
	if err := os.WriteFile(filepath.Join(root, "secret.env"), []byte("TOPSECRET"), 0o644); err != nil {
		t.Fatal(err)
	}
	entries, err := BuildManifest(ws)
	if err != nil {
		t.Fatal(err)
	}

	paths := map[string]FileManifestEntry{}
	for _, e := range entries {
		paths[e.Path] = e
	}
	if _, ok := paths["script.json"]; !ok {
		t.Fatal("script.json missing from manifest")
	}
	if _, ok := paths["timelines/hook.timeline.json"]; !ok {
		t.Fatal("timeline missing from manifest")
	}
	if len(entries) != 2 {
		t.Fatalf("allow-list leaked extra files: %+v", entries)
	}

	sum := sha256.Sum256([]byte(`{"post":"x"}`))
	if got := paths["script.json"].Sha256; got != hex.EncodeToString(sum[:]) {
		t.Fatalf("sha256 mismatch: %s", got)
	}
	if paths["script.json"].Bytes != uint64(len(`{"post":"x"}`)) {
		t.Fatalf("bytes mismatch")
	}
	for _, e := range entries {
		if filepath.IsAbs(e.Path) || hasBackslash(e.Path) {
			t.Fatalf("path must be POSIX relative: %q", e.Path)
		}
	}
}

func hasBackslash(s string) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' {
			return true
		}
	}
	return false
}

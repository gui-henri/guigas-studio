package artifacts

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gui-henri/guigas-studio/backend/internal/auth"
)

// FilesHandler serves workspace files for the runner input sync (S5-04):
// GET /api/v1/videos/{slug}/files/{path...} streams the file with Range
// support via http.ServeContent. Auth: user JWT or RUNNER_TOKEN — the
// authorize callback returns true when the raw bearer token is valid for
// either (server composes both checks).
type FilesHandler struct {
	root      string // <DATA_DIR>/videos
	authorize func(r *http.Request) bool
}

func NewFilesHandler(root string, jwtSecret string) *FilesHandler {
	return &FilesHandler{
		root: root,
		authorize: func(r *http.Request) bool {
			raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if raw == "" {
				raw = r.URL.Query().Get("token")
			}
			if raw == "" {
				return false
			}
			if _, err := auth.ParseToken(jwtSecret, raw); err == nil {
				return true
			}
			if runnerToken := os.Getenv("RUNNER_TOKEN"); runnerToken != "" {
				return secureEquals(raw, runnerToken)
			}
			return false
		},
	}
}

func secureEquals(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

// BuildManifest walks the workspace with an EXPLICIT allow-list (script.json,
// audio/, timelines/, assets/) and returns POSIX-path entries with sha256 +
// size. Never walks the whole directory: no .env/renders leakage (S5-04).
func BuildManifest(workspaceRoot string) ([]FileManifestEntry, error) {
	entries := []FileManifestEntry{}
	addFile := func(rel string) error {
		full := filepath.Join(workspaceRoot, filepath.FromSlash(rel))
		data, err := os.ReadFile(full)
		if err != nil {
			if os.IsNotExist(err) {
				return nil // optional file (e.g. subtitles may not exist yet)
			}
			return err
		}
		sum := sha256.Sum256(data)
		entries = append(entries, FileManifestEntry{
			Path:   rel,
			Sha256: hex.EncodeToString(sum[:]),
			Bytes:  uint64(len(data)),
		})
		return nil
	}
	if err := addFile("script.json"); err != nil {
		return nil, err
	}
	for _, dir := range []string{"audio", "timelines", "assets"} {
		dirPath := filepath.Join(workspaceRoot, dir)
		filepath.WalkDir(dirPath, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil // missing dir is fine
			}
			if d.IsDir() {
				return nil
			}
			rel, relErr := filepath.Rel(workspaceRoot, path)
			if relErr != nil {
				return nil
			}
			if err := addFile(filepath.ToSlash(rel)); err != nil {
				return err
			}
			return nil
		})
	}
	return entries, nil
}

func (h *FilesHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	slug := r.PathValue("videoSlug")
	if slug == "" {
		slug = r.PathValue("slug")
	}
	rel := r.PathValue("path")
	if slug == "" || rel == "" || strings.Contains(rel, "\\") {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	workspace := filepath.Join(h.root, filepath.Clean(slug))
	full := filepath.Join(workspace, filepath.Clean("/"+rel))

	// Traversal guard: resolved file MUST stay inside the slug workspace.
	cleanRel, err := filepath.Rel(workspace, full)
	if err != nil || strings.HasPrefix(cleanRel, "..") {
		http.Error(w, "path escapes workspace", http.StatusBadRequest)
		return
	}

	f, err := os.Open(full)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()

	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, filepath.Base(full), zeroTime, f)
}

// zeroTime keeps ServeContent from emitting Last-Modified caching headers —
// workspace files change between jobs.
var zeroTime time.Time

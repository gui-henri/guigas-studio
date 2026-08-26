package artifacts

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gui-henri/guigas-studio/backend/internal/auth"
)

// RendersUploadHandler receives runner-rendered MP4s (S5-07, T-04):
//
//	PUT  /api/v1/videos/{slug}/renders/{file}/chunks   (X-Offset header, raw body)
//	POST /api/v1/videos/{slug}/renders/{file}/finalize ({sha256, bytes} JSON)
//
// Auth: user JWT or RUNNER_TOKEN. Chunks accumulate in a temp sidecar; the
// finalize step verifies size+sha256 BEFORE moving the file into renders/ —
// a corrupted upload is rejected without ever polluting the workspace.
type RendersUploadHandler struct {
	root      string
	authorize func(r *http.Request) bool
}

func NewRendersUploadHandler(root, jwtSecret, runnerToken string) *RendersUploadHandler {
	return &RendersUploadHandler{
		root: root,
		authorize: func(r *http.Request) bool {
			raw := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if raw == "" {
				return false
			}
			if _, err := auth.ParseToken(jwtSecret, raw); err == nil {
				return true
			}
			if runnerToken != "" && secureEquals(raw, runnerToken) {
				return true
			}
			return false
		},
	}
}

func (h *RendersUploadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !h.authorize(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	slug := filepath.Clean(r.PathValue("slug"))
	file := r.PathValue("file")
	if slug == "" || slug == "." || file == "" || !validRenderFileName(file) {
		http.Error(w, "invalid target", http.StatusBadRequest)
		return
	}

	switch {
	case strings.HasSuffix(r.URL.Path, "/chunks") && r.Method == http.MethodPut:
		h.handleChunk(w, r, slug, file)
	case strings.HasSuffix(r.URL.Path, "/finalize") && r.Method == http.MethodPost:
		h.handleFinalize(w, r, slug, file)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func validRenderFileName(name string) bool {
	if name != filepath.Base(name) || strings.ContainsAny(name, "\\/") {
		return false
	}
	return strings.HasSuffix(name, ".mp4")
}

// slugWorkspace is <root>/videos/<slug> — the canonical workspace.
func (h *RendersUploadHandler) slugWorkspace(slug string) string {
	return filepath.Join(h.root, "videos", slug)
}

func (h *RendersUploadHandler) tempPath(slug, file string) string {
	return filepath.Join(h.root, ".uploads", slug, file+".part")
}

func (h *RendersUploadHandler) handleChunk(w http.ResponseWriter, r *http.Request, slug, file string) {
	offset := int64(0)
	if v := r.Header.Get("X-Offset"); v != "" {
		if _, err := fmt.Sscanf(v, "%d", &offset); err != nil {
			http.Error(w, "invalid X-Offset", http.StatusBadRequest)
			return
		}
	}

	tmp := h.tempPath(slug, file)
	if err := os.MkdirAll(filepath.Dir(tmp), 0o755); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}

	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	defer f.Close()

	if offset > 0 {
		if fi, statErr := f.Stat(); statErr != nil || fi.Size() < offset {
			http.Error(w, "offset beyond received data", http.StatusBadRequest)
			return
		}
	}
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		http.Error(w, "seek failed", http.StatusInternalServerError)
		return
	}
	if _, err := io.Copy(f, r.Body); err != nil {
		http.Error(w, "write failed", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type finalizeBody struct {
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

func (h *RendersUploadHandler) handleFinalize(w http.ResponseWriter, r *http.Request, slug, file string) {
	var body finalizeBody
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	tmp := h.tempPath(slug, file)
	data, err := os.ReadFile(tmp)
	if err != nil {
		http.Error(w, "no chunks uploaded", http.StatusBadRequest)
		return
	}
	sum := sha256.Sum256(data)
	got := hex.EncodeToString(sum[:])
	if got != strings.ToLower(body.SHA256) || int64(len(data)) != body.Bytes {
		os.Remove(tmp) // corrupted upload: force clean re-send
		http.Error(w, "checksum mismatch", http.StatusConflict)
		return
	}

	destDir := filepath.Join(h.slugWorkspace(slug), "renders")
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	dest := filepath.Join(destDir, file)
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}
	os.Remove(tmp)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"path": "renders/" + file, "sha256": got, "bytes": len(data),
	})
}

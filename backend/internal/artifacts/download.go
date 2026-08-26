package artifacts

import (
	"errors"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/middleware"
)

func parseUUID(raw string) (uuid.UUID, error) {
	return uuid.Parse(raw)
}

// allowedPrefixes maps workspace directory prefixes to permitted extensions.
var allowedPrefixes = map[string][]string{
	"audio":     {".wav", ".json"}, // takes + visemes/blendshapes sidecars
	"timelines": {".json"},
	"assets":    {".png", ".jpg", ".json", ".wav"},
}

// DownloadHandler serves GET /api/v1/videos/{videoID}/artifacts/{path...}
// with Bearer auth and strict path sanitization (T-04 read mirror).
type DownloadHandler struct {
	queries *sqlc.Queries
	dataDir string
	verify  middleware.VerifyToken
}

func NewDownloadHandler(queries *sqlc.Queries, dataDir string, verify middleware.VerifyToken) *DownloadHandler {
	return &DownloadHandler{queries: queries, dataDir: dataDir, verify: verify}
}

func (h *DownloadHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !middleware.AuthorizeBearer(r.Header.Get("Authorization"), h.verify) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	videoID := r.PathValue("videoID")
	relPath := r.PathValue("path")

	id, perr := parseUUID(videoID)
	if perr != nil {
		http.Error(w, "invalid video id", http.StatusBadRequest)
		return
	}
	video, err := h.queries.GetVideo(r.Context(), id)
	if err != nil {
		http.Error(w, "unknown video", http.StatusNotFound)
		return
	}

	clean, err := sanitizeArtifactPath(relPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	full := filepath.Join(h.dataDir, "videos", video.Slug, clean)
	f, err := os.Open(full)
	if err != nil {
		if os.IsNotExist(err) {
			http.Error(w, "artifact not found", http.StatusNotFound)
			return
		}
		http.Error(w, "cannot open artifact", http.StatusInternalServerError)
		return
	}
	defer f.Close()

	fi, _ := f.Stat()
	w.Header().Set("Content-Type", contentTypeFor(clean))
	http.ServeContent(w, r, filepath.Base(clean), fi.ModTime(), f)
}

// sanitizeArtifactPath rejects traversal, absolute paths and non-allowlisted
// prefix/extension combinations.
func sanitizeArtifactPath(relPath string) (string, error) {
	if relPath == "" || strings.HasPrefix(relPath, "/") || strings.Contains(relPath, "..") ||
		strings.Contains(relPath, "\\") {
		return "", errors.New("invalid artifact path")
	}
	clean := path.Clean(relPath)
	parts := strings.SplitN(clean, "/", 2)
	if len(parts) != 2 {
		return "", errors.New("artifact path must be <dir>/<file>")
	}
	exts, ok := allowedPrefixes[parts[0]]
	if !ok {
		return "", errors.New("directory not allowed")
	}
	ext := strings.ToLower(filepath.Ext(parts[1]))
	for _, e := range exts {
		if e == ext && !strings.Contains(parts[1], "/") {
			return clean, nil
		}
	}
	return "", errors.New("extension not allowed")
}

func contentTypeFor(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.HasSuffix(lower, ".wav"):
		return "audio/wav"
	case strings.HasSuffix(lower, ".json"):
		return "application/json"
	case strings.HasSuffix(lower, ".png"):
		return "image/png"
	default:
		return "application/octet-stream"
	}
}

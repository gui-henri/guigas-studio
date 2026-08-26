// Package upload implements the raw-HTTP chunked take upload endpoint (T-04):
// streaming body, resumable partials, checksum verification and direct write
// into the canonical workspace — no multipart, no S3.
package upload

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/middleware"
)

const (
	defaultMaxUploadBytes = 64 << 20
	partialDir            = ".partials"
)

var (
	segmentIDRe = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`)
	kindExt     = map[string]string{
		"audio":       ".wav",
		"blendshapes": ".blendshapes.json",
	}
)

// Handler serves POST/GET /api/v1/videos/{videoSlug}/takes.
type Handler struct {
	queries     *sqlc.Queries
	pool        *pgxpool.Pool
	dataDir     string
	verify      middleware.VerifyToken
	maxUpload   int64
	afterUpsert func(videoSlug string) // optional post-upload pipeline hook
}

// SetAfterUpsert registers a callback fired (async caller's choice) after a
// take is recorded — used to trigger the concat service.
func (h *Handler) SetAfterUpsert(fn func(videoSlug string)) { h.afterUpsert = fn }

func NewHandler(queries *sqlc.Queries, pool *pgxpool.Pool, dataDir string, verify middleware.VerifyToken) *Handler {
	return &Handler{
		queries:   queries,
		pool:      pool,
		dataDir:   dataDir,
		verify:    verify,
		maxUpload: defaultMaxUploadBytes,
	}
}

// SetOnFirstTake registers a callback fired once when a video enters recording.
func (h *Handler) SetOnFirstTake(fn func(videoSlug string)) { h.afterUpsert = fn }

// response payloads.

type probeResponse struct {
	Size       int64 `json:"size"`
	NextOffset int64 `json:"next_offset"`
}

type chunkResponse struct {
	Received   int64 `json:"received"`
	NextOffset int64 `json:"next_offset"`
	Complete   bool  `json:"complete"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if !middleware.AuthorizeBearer(r.Header.Get("Authorization"), h.verify) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	videoSlug := r.PathValue("videoSlug")
	if !validName(videoSlug) {
		http.Error(w, "invalid video slug", http.StatusBadRequest)
		return
	}
	q := r.URL.Query()
	segmentID := q.Get("segment_id")
	kind := q.Get("kind")
	if !validName(segmentID) || strings.Contains(segmentID, "..") {
		http.Error(w, "invalid segment_id", http.StatusBadRequest)
		return
	}
	if _, err := h.queries.GetVideoBySlug(r.Context(), videoSlug); err != nil {
		http.Error(w, "unknown video", http.StatusNotFound)
		return
	}

	audioDir := filepath.Join(h.dataDir, "videos", videoSlug, "audio")

	if r.Method == http.MethodDelete {
		h.deleteTake(w, r, videoSlug, segmentID, audioDir)
		return
	}

	ext, ok := kindExt[kind]
	if !ok {
		http.Error(w, "kind must be audio or blendshapes", http.StatusBadRequest)
		return
	}

	partialPath := filepath.Join(audioDir, partialDir, segmentID+"."+kind+".part")
	finalPath := filepath.Join(audioDir, segmentID+ext)

	switch r.Method {
	case http.MethodGet:
		h.probe(w, r, partialPath)
	case http.MethodPost:
		h.receiveChunk(w, r, videoSlug, segmentID, kind, ext, audioDir, partialPath, finalPath)
	default:
		w.Header().Set("Allow", "GET, POST, DELETE")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (h *Handler) deleteTake(w http.ResponseWriter, r *http.Request, videoSlug, segmentID, audioDir string) {
	ctx := r.Context()
	if err := h.queries.DeleteTakesBySegment(ctx, sqlc.DeleteTakesBySegmentParams{
		VideoSlug: videoSlug,
		SegmentID: segmentID,
	}); err != nil {
		slog.Error("delete take failed", "error", err, "slug", videoSlug, "segment", segmentID)
		http.Error(w, "failed to delete take", http.StatusInternalServerError)
		return
	}

	// Remove physical files
	_ = os.Remove(filepath.Join(audioDir, segmentID+".wav"))
	_ = os.Remove(filepath.Join(audioDir, segmentID+".blendshapes.json"))
	_ = os.Remove(filepath.Join(audioDir, partialDir, segmentID+".audio.part"))
	_ = os.Remove(filepath.Join(audioDir, partialDir, segmentID+".blendshapes.part"))

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"deleted": true})
}

func (h *Handler) probe(w http.ResponseWriter, _ *http.Request, partialPath string) {
	size := fileSize(partialPath)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(probeResponse{Size: size, NextOffset: size})
}

func (h *Handler) receiveChunk(
	w http.ResponseWriter,
	r *http.Request,
	videoSlug, segmentID, kind, ext, audioDir, partialPath, finalPath string,
) {
	ctx := r.Context()

	total, err := strconv.ParseInt(r.Header.Get("X-Total-Size"), 10, 64)
	if err != nil || total <= 0 {
		http.Error(w, "missing X-Total-Size", http.StatusBadRequest)
		return
	}
	if total > h.maxUpload {
		http.Error(w, fmt.Sprintf("file exceeds max upload of %d bytes", h.maxUpload), http.StatusRequestEntityTooLarge)
		return
	}
	offset, err := strconv.ParseInt(r.URL.Query().Get("offset"), 10, 64)
	if err != nil || offset < 0 {
		offset = 0
	}
	wantChecksum := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Checksum-Sha256")))
	durationMs, _ := strconv.ParseInt(r.Header.Get("X-Duration-Ms"), 10, 64)

	current := fileSize(partialPath)
	if offset > current {
		// Client is ahead of what the server has; ask it to resend from current end.
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(probeResponse{Size: current, NextOffset: current})
		return
	}

	// Open partial for append; truncate to offset for clean resume semantics.
	if err := os.MkdirAll(filepath.Dir(partialPath), 0o755); err != nil {
		http.Error(w, "cannot create partial dir", http.StatusInternalServerError)
		return
	}
	f, err := os.OpenFile(partialPath, os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		http.Error(w, "cannot open partial", http.StatusInternalServerError)
		return
	}
	defer f.Close()
	if offset < current {
		if err := f.Truncate(offset); err != nil {
			http.Error(w, "cannot truncate partial", http.StatusInternalServerError)
			return
		}
		current = offset
	}
	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		http.Error(w, "seek failed", http.StatusInternalServerError)
		return
	}

	limited := io.LimitReader(r.Body, total-offset)
	received, err := io.Copy(f, limited)
	if err != nil {
		http.Error(w, "read body failed", http.StatusInternalServerError)
		return
	}
	newSize := current + received

	respond := func(status int) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(chunkResponse{Received: received, NextOffset: newSize, Complete: false})
	}
	if newSize < total {
		respond(http.StatusOK)
		return
	}

	// Finalization: verify full-file checksum, then atomically publish.
	checksum, cErr := fileSHA256(partialPath)
	if cErr != nil {
		http.Error(w, "checksum failed", http.StatusInternalServerError)
		return
	}
	if wantChecksum == "" || wantChecksum != checksum {
		slog.Warn("upload.checksum_mismatch",
			slog.String("slug", videoSlug), slog.String("segment", segmentID),
			slog.String("want", wantChecksum), slog.String("got", checksum))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": "checksum mismatch; partial preserved",
			"got":   checksum,
		})
		return
	}
	if err := os.Rename(partialPath, finalPath); err != nil {
		http.Error(w, "publish failed", http.StatusInternalServerError)
		return
	}

	relPath, _ := filepath.Rel(filepath.Join(h.dataDir, "videos", videoSlug), finalPath)
	if _, err := h.queries.UpsertTake(ctx, sqlc.UpsertTakeParams{
		VideoSlug:  videoSlug,
		SegmentID:  segmentID,
		Kind:       kind,
		RelPath:    relPath,
		SizeBytes:  newSize,
		Sha256:     checksum,
		DurationMs: durationMs,
	}); err != nil {
		slog.Error("upload.take_record_failed", slog.Any("error", err))
		http.Error(w, "take record failed", http.StatusInternalServerError)
		return
	}

	h.maybeEnterRecording(ctx, videoSlug)
	if h.afterUpsert != nil {
		h.afterUpsert(videoSlug)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(chunkResponse{Received: received, NextOffset: newSize, Complete: true})
}

// maybeEnterRecording promotes script_approved → recording exactly once,
// before the first take of the video is acknowledged.
func (h *Handler) maybeEnterRecording(ctx context.Context, videoSlug string) {
	video, err := h.queries.GetVideoBySlug(ctx, videoSlug)
	if err != nil {
		return
	}
	if videostate.State(video.Status) != videostate.StateScriptApproved {
		return // already recording (or elsewhere); idempotent no-op
	}
	count, err := h.queries.CountTakesForVideo(ctx, videoSlug)
	if err != nil || count != 1 { // this handler's upsert just inserted the first
		return
	}
	if err := videostate.Transition(videostate.StateScriptApproved, videostate.StateRecording); err != nil {
		slog.Warn("upload.transition_rejected", slog.Any("error", err))
		return
	}
	if err := h.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID:     video.ID,
		Status: string(videostate.StateRecording),
	}); err != nil {
		slog.Error("upload.status_update_failed", slog.Any("error", err))
		return
	}
	_, _ = h.pool.Exec(ctx,
		`INSERT INTO video_status_history (video_id, status, reason, actor) VALUES ($1,$2,$3,$4)`,
		video.ID, string(videostate.StateRecording), "first take uploaded", "studio-web")
	slog.Info("upload.recording_started", slog.String("slug", videoSlug))
	if h.afterUpsert != nil {
		h.afterUpsert(videoSlug)
	}
}

// helpers -------------------------------------------------------------

func validName(s string) bool {
	return s != "" && len(s) <= 128 && segmentIDRe.MatchString(s)
}

func fileSize(path string) int64 {
	fi, err := os.Stat(path)
	if err != nil || fi.IsDir() {
		return 0
	}
	return fi.Size()
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

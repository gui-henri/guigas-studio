package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/google/uuid"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	"github.com/gui-henri/guigas-studio/backend/internal/artifacts"
	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/events"
	"github.com/gui-henri/guigas-studio/backend/internal/watcher"
	"github.com/gui-henri/guigas-studio/backend/internal/workspace"
)

// videoStatusToProto maps the free-text DB status to the canonical proto enum.
// The executable state machine lives in videostate (S0-15) and keeps this in sync.
var videoStatusToProto = map[string]studiov1.VideoStatus{
	"new":              studiov1.VideoStatus_VIDEO_STATUS_NEW,
	"script_pending":   studiov1.VideoStatus_VIDEO_STATUS_SCRIPT_PENDING,
	"script_review":    studiov1.VideoStatus_VIDEO_STATUS_SCRIPT_REVIEW,
	"script_approved":  studiov1.VideoStatus_VIDEO_STATUS_SCRIPT_APPROVED,
	"recording":        studiov1.VideoStatus_VIDEO_STATUS_RECORDING,
	"voice_processing": studiov1.VideoStatus_VIDEO_STATUS_VOICE_PROCESSING,
	"scenes_pending":   studiov1.VideoStatus_VIDEO_STATUS_SCENES_PENDING,
	"scenes_review":    studiov1.VideoStatus_VIDEO_STATUS_SCENES_REVIEW,
	"queued":           studiov1.VideoStatus_VIDEO_STATUS_QUEUED,
	"rendering":        studiov1.VideoStatus_VIDEO_STATUS_RENDERING,
	"final_review":     studiov1.VideoStatus_VIDEO_STATUS_FINAL_REVIEW,
	"released":         studiov1.VideoStatus_VIDEO_STATUS_RELEASED,
	"blocked":          studiov1.VideoStatus_VIDEO_STATUS_BLOCKED,
}

func statusToProto(status string) studiov1.VideoStatus {
	if v, ok := videoStatusToProto[status]; ok {
		return v
	}
	return studiov1.VideoStatus_VIDEO_STATUS_UNSPECIFIED
}

var _ studiov1connect.VideoServiceHandler = (*VideoService)(nil)

// VideoService implements studio.v1.VideoService, including the script review
// flow (S1-04).
type VideoService struct {
	queries *sqlc.Queries
	pool    *pgxpool.Pool // enables transactional multi-step mutations
	dataDir string
	hub     *events.Hub // optional; nil disables SSE publishing
	jobs    *JobsQueue
	watcher *watcher.Watcher
}

// NewVideoService returns the Connect handler for VideoService. The pool may
// be nil in tests that never hit transactional paths (ApproveScenes).
func NewVideoService(queries *sqlc.Queries, dataDir string, hub *events.Hub, pool *pgxpool.Pool) *VideoService {
	return &VideoService{
		queries: queries,
		pool:    pool,
		dataDir: dataDir,
		hub:     hub,
		jobs:    NewJobsQueue(queries),
	}
}

// SetWatcher configures the optional RSS watcher instance for manual polling.
func (s *VideoService) SetWatcher(w *watcher.Watcher) {
	s.watcher = w
}

func (s *VideoService) TriggerRssPoll(
	ctx context.Context,
	req *connect.Request[studiov1.TriggerRssPollRequest],
) (*connect.Response[studiov1.TriggerRssPollResponse], error) {
	if s.watcher == nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("rss watcher not configured"))
	}
	created, err := s.watcher.Poll(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("rss poll failed: %w", err))
	}
	protoVideos := make([]*studiov1.Video, 0, len(created))
	for i := range created {
		protoVideos = append(protoVideos, videoToProto(&created[i]))
	}
	return connect.NewResponse(&studiov1.TriggerRssPollResponse{
		NewPostsCount: int32(len(created)),
		CreatedVideos: protoVideos,
	}), nil
}

// publishStatusChanged emits video.status_changed to global + per-video topics.
func (s *VideoService) publishStatusChanged(videoID, slug, from, to string) {
	if s.hub == nil {
		return
	}
	evt := &studiov1.StudioEvent{
		Event: &studiov1.StudioEvent_VideoStatusChanged{
			VideoStatusChanged: &studiov1.VideoStatusChanged{
				VideoId:    videoID,
				Slug:       slug,
				FromStatus: from,
				ToStatus:   to,
			},
		},
	}
	s.hub.Publish(events.TopicGlobal, evt)
	s.hub.Publish(events.TopicForVideo(videoID), evt)
}

// workspaceRoot returns <dataDir>/videos/<slug>.
func (s *VideoService) workspaceRoot(slug string) string {
	return filepath.Join(s.dataDir, "videos", slug)
}

func videoToProto(v *sqlc.Video) *studiov1.Video {
	return &studiov1.Video{
		Id:        v.ID.String(),
		Slug:      v.Slug,
		Title:     v.Title,
		SourceUrl: v.SourceUrl,
		Status:    statusToProto(v.Status),
		CreatedAt: v.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt: v.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// ListVideos returns up to 200 videos ordered by creation date (desc).
func (s *VideoService) ListVideos(
	ctx context.Context,
	req *connect.Request[studiov1.ListVideosRequest],
) (*connect.Response[studiov1.ListVideosResponse], error) {
	rows, err := s.queries.ListVideos(ctx)
	if err != nil {
		slog.Error("list videos failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list videos"))
	}
	videos := make([]*studiov1.Video, 0, len(rows))
	for i := range rows {
		videos = append(videos, videoToProto(&rows[i]))
	}
	return connect.NewResponse(&studiov1.ListVideosResponse{Videos: videos}), nil
}

// GetVideo returns the index entry plus parsed script, artifacts presence and
// audited status history.
func (s *VideoService) GetVideo(
	ctx context.Context,
	req *connect.Request[studiov1.GetVideoRequest],
) (*connect.Response[studiov1.GetVideoResponse], error) {
	id, err := parseUUID(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	video, err := s.queries.GetVideo(ctx, id)
	if err != nil {
		if errors.Is(err, errNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("video not found"))
		}
		slog.Error("get video failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to get video"))
	}

	resp := &studiov1.GetVideoResponse{
		Video:           videoToProto(&video),
		Artifacts:       s.artifactPresence(video.Slug),
		StatusHistory:   []*studiov1.StatusChange{},
		RenderArtifacts: []*studiov1.RenderArtifactView{},
	}

	if rows, rErr := s.queries.ListRenderArtifacts(ctx, video.ID); rErr == nil {
		for _, row := range rows {
			resp.RenderArtifacts = append(resp.RenderArtifacts, &studiov1.RenderArtifactView{
				Path:      row.Path,
				Bytes:     uint64(row.Bytes),
				DurationS: row.DurationS,
			})
		}
	}

	history, err := s.queries.ListStatusHistoryByVideo(ctx, video.ID)
	if err == nil {
		for _, h := range history {
			resp.StatusHistory = append(resp.StatusHistory, &studiov1.StatusChange{
				Status:    h.Status,
				Reason:    h.Reason,
				Actor:     h.Actor,
				ChangedAt: h.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
			})
		}
	}

	scriptPath := filepath.Join(s.workspaceRoot(video.Slug), artifacts.ScriptFileName)
	if raw, readErr := os.ReadFile(scriptPath); readErr == nil {
		script, vErrors := artifacts.ValidateScript(raw)
		if len(vErrors) == 0 {
			resp.Script = script
			if original, oErr := s.loadOriginalScript(ctx, video.ID); oErr == nil {
				resp.OriginalScript = original
			}
		}
	}

	return connect.NewResponse(resp), nil
}

func (s *VideoService) loadOriginalScript(ctx context.Context, videoID uuid.UUID) (*studiov1.StudioScript, error) {
	raw, err := s.queries.GetOriginalScript(ctx, videoID)
	if err != nil || len(raw) == 0 {
		return nil, fmt.Errorf("no original script: %w", err)
	}
	script := &studiov1.StudioScript{}
	opts := protojson.UnmarshalOptions{DiscardUnknown: true}
	if err := opts.Unmarshal(raw, script); err != nil {
		return nil, err
	}
	return script, nil
}

// artifactPresence checks which workspace artifact groups exist on disk.
func (s *VideoService) artifactPresence(slug string) *studiov1.VideoArtifacts {
	root := s.workspaceRoot(slug)
	exists := func(rel string) bool {
		_, err := os.Stat(filepath.Join(root, rel))
		return err == nil
	}
	return &studiov1.VideoArtifacts{
		Script:    exists("script.json"),
		Audio:     hasFiles(filepath.Join(root, "audio"), ".wav"),
		Timelines: exists(filepath.Join(root, "timelines")),
		Renders:   exists(filepath.Join(root, "renders")),
	}
}

func hasFiles(dir, ext string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ext {
			return true
		}
	}
	return false
}

// CreateVideo inserts a new video into the pipeline index.
func (s *VideoService) CreateVideo(
	ctx context.Context,
	req *connect.Request[studiov1.CreateVideoRequest],
) (*connect.Response[studiov1.CreateVideoResponse], error) {
	if req.Msg.GetSlug() == "" || req.Msg.GetTitle() == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("slug and title are required"))
	}
	video, err := s.queries.CreateVideo(ctx, sqlc.CreateVideoParams{
		Slug:      req.Msg.GetSlug(),
		Title:     req.Msg.GetTitle(),
		SourceUrl: req.Msg.GetSourceUrl(),
	})
	if err != nil {
		slog.Error("create video failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to create video"))
	}
	return connect.NewResponse(&studiov1.CreateVideoResponse{Video: videoToProto(&video)}), nil
}

// UpdateScript validates and writes script.json from UI edits (T-07 commit).
func (s *VideoService) UpdateScript(
	ctx context.Context,
	req *connect.Request[studiov1.UpdateScriptRequest],
) (*connect.Response[studiov1.UpdateScriptResponse], error) {
	video, release := s.videoForReview(ctx, req.Msg.GetVideoId())
	defer release()
	if video == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	if videostate.State(video.Status) != videostate.StateScriptReview {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			errors.New("script can only be edited while in script_review (reopen via RejectScript)"))
	}

	scriptJSON, err := protojson.MarshalOptions{}.Marshal(req.Msg.GetScript())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("script cannot be serialized"))
	}
	parsed, vErrors := artifacts.ValidateScript(scriptJSON)
	if len(vErrors) > 0 {
		msgs := make([]string, 0, len(vErrors))
		for _, e := range vErrors {
			msgs = append(msgs, e.Error())
		}
		return connect.NewResponse(&studiov1.UpdateScriptResponse{Errors: msgs}), nil
	}

	root := s.workspaceRoot(video.Slug)
	scriptPath := filepath.Join(root, artifacts.ScriptFileName)
	tmpPath := scriptPath + ".tmp"
	if err := os.WriteFile(tmpPath, scriptJSON, 0o644); err != nil {
		slog.Error("update script write failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to write script"))
	}
	if err := os.Rename(tmpPath, scriptPath); err != nil { // atomic swap
		_ = os.Remove(tmpPath)
		slog.Error("update script rename failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to write script"))
	}
	if err := workspace.Commit(root, fmt.Sprintf("feat(%s): update script via ui", video.Slug)); err != nil {
		slog.Error("update script commit failed", "slug", video.Slug, "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to version script in workspace git"))
	}

	return connect.NewResponse(&studiov1.UpdateScriptResponse{Script: parsed}), nil
}

// ApproveScript moves script_review → script_approved recording the actor.
func (s *VideoService) ApproveScript(
	ctx context.Context,
	req *connect.Request[studiov1.ApproveScriptRequest],
) (*connect.Response[studiov1.ApproveScriptResponse], error) {
	video, release := s.videoForReview(ctx, req.Msg.GetVideoId())
	defer release()
	if video == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	actor := auth.ActorFromContext(ctx)

	if err := s.transitionAndRecord(ctx, video, videostate.StateScriptApproved, "", actor); err != nil {
		return nil, err
	}
	updated, gErr := s.queries.GetVideo(ctx, video.ID)
	if gErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to reload video"))
	}
	return connect.NewResponse(&studiov1.ApproveScriptResponse{Video: videoToProto(&updated)}), nil
}

// RejectScript returns the video to script_pending with a structured comment.
func (s *VideoService) RejectScript(
	ctx context.Context,
	req *connect.Request[studiov1.RejectScriptRequest],
) (*connect.Response[studiov1.RejectScriptResponse], error) {
	video, release := s.videoForReview(ctx, req.Msg.GetVideoId())
	defer release()
	if video == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	actor := auth.ActorFromContext(ctx)

	if err := s.transitionAndRecord(ctx, video, videostate.StateScriptPending, req.Msg.GetComment(), actor); err != nil {
		return nil, err
	}
	updated, gErr := s.queries.GetVideo(ctx, video.ID)
	if gErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to reload video"))
	}
	return connect.NewResponse(&studiov1.RejectScriptResponse{Video: videoToProto(&updated)}), nil
}

// transitionAndRecord applies videostate.Transition, persists status and appends history.
func (s *VideoService) transitionAndRecord(ctx context.Context, video *sqlc.Video, to videostate.State, reason, actor string) error {
	from := videostate.State(video.Status)
	if err := videostate.Transition(from, to); err != nil {
		return connect.NewError(connect.CodeFailedPrecondition, err)
	}
	if err := s.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID:     video.ID,
		Status: string(to),
	}); err != nil {
		slog.Error("status update failed", "error", err)
		return connect.NewError(connect.CodeInternal, errors.New("failed to update status"))
	}
	if err := s.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: video.ID,
		Status:  string(to),
		Reason:  reason,
		Actor:   actor,
	}); err != nil {
		slog.Error("history insert failed", "error", err)
	}
	s.publishStatusChanged(video.ID.String(), video.Slug, string(from), string(to))
	return nil
}

// ApproveScenes arms the render (S5-01): scenes_review → queued plus exactly
// one pending render job, both inside a single transaction. Rejected unless
// the video sits in scenes_review.
func (s *VideoService) ApproveScenes(
	ctx context.Context,
	req *connect.Request[studiov1.ApproveScenesRequest],
) (*connect.Response[studiov1.ApproveScenesResponse], error) {
	if s.pool == nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("service not configured for transactions"))
	}
	videoID, err := parseUUID(req.Msg.GetVideoId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	video, err := s.queries.GetVideo(ctx, videoID)
	if err != nil {
		if errors.Is(err, errNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("video not found"))
		}
		slog.Error("approve scenes: load failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to load video"))
	}

	from := videostate.State(video.Status)
	if from != videostate.StateScenesReview {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("video is %s; scenes approval requires scenes_review", from))
	}

	// Payload preconditions are validated BEFORE the transaction touches state.
	scriptPath := filepath.Join(s.workspaceRoot(video.Slug), artifacts.ScriptFileName)
	rawScript, readErr := os.ReadFile(scriptPath)
	if readErr != nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			errors.New("script.json missing from workspace — cannot arm render"))
	}
	if sErr := s.stageSoundtrack(video.Slug, rawScript); sErr != nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("soundtrack: %v", sErr))
	}
	payload := JobPayload{
		Slug:           video.Slug,
		ExpectedShorts: CountShortMarkers(rawScript),
		InputManifest:  BuildJobManifest(s.dataDir, video.Slug),
	}

	actor := auth.ActorFromContext(ctx)

	tx, txErr := s.pool.Begin(ctx)
	if txErr != nil {
		slog.Error("approve scenes: begin failed", "error", txErr)
		return nil, connect.NewError(connect.CodeInternal, errors.New("transaction failed"))
	}
	defer func() { _ = tx.Rollback(ctx) }()
	txQueries := s.queries.WithTx(tx)

	if err := videostate.Transition(from, videostate.StateQueued); err != nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition, err)
	}
	if err := txQueries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID:     video.ID,
		Status: string(videostate.StateQueued),
	}); err != nil {
		slog.Error("approve scenes: status update failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to update status"))
	}
	if err := txQueries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: video.ID,
		Status:  string(videostate.StateQueued),
		Reason:  "scenes approved",
		Actor:   actor,
	}); err != nil {
		slog.Error("approve scenes: history insert failed", "error", err)
	}
	job, err := txQueries.EnqueueJob(ctx, sqlc.EnqueueJobParams{
		VideoID: video.ID,
		Type:    JobTypeRenderLongShorts,
		Payload: mustJSON(payload),
	})
	if err != nil {
		slog.Error("approve scenes: enqueue failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to enqueue render job"))
	}
	if err := tx.Commit(ctx); err != nil {
		slog.Error("approve scenes: commit failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("transaction failed"))
	}

	s.publishStatusChanged(video.ID.String(), video.Slug, string(from), string(videostate.StateQueued))
	slog.Info("render queued",
		"video_id", video.ID.String(), "job_id", job.ID.String(),
		"expected_shorts", payload.ExpectedShorts)

	updated, gErr := s.queries.GetVideo(ctx, video.ID)
	if gErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to reload video"))
	}
	return connect.NewResponse(&studiov1.ApproveScenesResponse{Video: videoToProto(&updated)}), nil
}

// stageSoundtrack copies the chosen repo track into the workspace assets/
// so it flows through the normal manifest+download path (S5-08). Absent
// soundtrack field → no-op.
func (s *VideoService) stageSoundtrack(slug string, rawScript []byte) error {
	var parsed struct {
		Soundtrack *struct {
			Track  string  `json:"track"`
			Volume float64 `json:"volume"`
		} `json:"soundtrack"`
	}
	if err := json.Unmarshal(rawScript, &parsed); err != nil {
		return nil // schema validation already rejected malformed scripts
	}
	if parsed.Soundtrack == nil || parsed.Soundtrack.Track == "" {
		return nil
	}
	track := filepath.Base(parsed.Soundtrack.Track) // no traversal
	repoTrack := filepath.Join("assets", "music", track)
	data, err := os.ReadFile(repoTrack)
	if err != nil {
		return fmt.Errorf("track %q not found in assets/music (see LICENSE.md)", track)
	}
	dest := filepath.Join(s.workspaceRoot(slug), "assets")
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dest, "soundtrack"+strings.ToLower(filepath.Ext(track))), data, 0o644)
}

func mustJSON(v any) []byte {
	raw, err := json.Marshal(v)
	if err != nil {
		panic(fmt.Sprintf("marshal job payload: %v", err))
	}
	return raw
}

// RequestRerender returns a final_review video to queued and re-enqueues the
// render job with payload.rerender=true (S5-07).
func (s *VideoService) RequestRerender(
	ctx context.Context,
	req *connect.Request[studiov1.RequestRerenderRequest],
) (*connect.Response[studiov1.RequestRerenderResponse], error) {
	if s.pool == nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("service not configured for transactions"))
	}
	videoID, err := parseUUID(req.Msg.GetVideoId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	video, err := s.queries.GetVideo(ctx, videoID)
	if err != nil {
		if errors.Is(err, errNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("video not found"))
		}
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to load video"))
	}
	from := videostate.State(video.Status)
	if from != videostate.StateFinalReview {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("video is %s; re-render requires final_review", from))
	}

	scriptPath := filepath.Join(s.workspaceRoot(video.Slug), artifacts.ScriptFileName)
	rawScript, readErr := os.ReadFile(scriptPath)
	if readErr != nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("script.json missing"))
	}
	payload := JobPayload{
		Slug:           video.Slug,
		ExpectedShorts: CountShortMarkers(rawScript),
		InputManifest:  BuildJobManifest(s.dataDir, video.Slug),
		Rerender:       true,
	}
	payloadRaw, _ := json.Marshal(payload)

	actor := auth.ActorFromContext(ctx)
	tx, txErr := s.pool.Begin(ctx)
	if txErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("transaction failed"))
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	if err := videostate.Transition(from, videostate.StateQueued); err != nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition, err)
	}
	if err := q.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{ID: video.ID, Status: string(videostate.StateQueued)}); err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to update status"))
	}
	if err := q.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: video.ID, Status: string(videostate.StateQueued),
		Reason: "re-render requested", Actor: actor,
	}); err != nil {
		slog.Warn("history insert failed", "error", err)
	}
	if _, err := q.EnqueueJob(ctx, sqlc.EnqueueJobParams{VideoID: video.ID, Type: JobTypeRenderLongShorts, Payload: payloadRaw}); err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to enqueue job"))
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("transaction failed"))
	}
	s.publishStatusChanged(video.ID.String(), video.Slug, string(from), string(videostate.StateQueued))

	updated, gErr := s.queries.GetVideo(ctx, video.ID)
	if gErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to reload video"))
	}
	return connect.NewResponse(&studiov1.RequestRerenderResponse{Video: videoToProto(&updated)}), nil
}

// ApproveFinalCut records approval and builds releases/<slug>/ (S5-09):
// youtube/ + shorts/ + social texts + SRT, committed in the workspace git.
func (s *VideoService) ApproveFinalCut(
	ctx context.Context,
	req *connect.Request[studiov1.ApproveFinalCutRequest],
) (*connect.Response[studiov1.ApproveFinalCutResponse], error) {
	videoID, err := parseUUID(req.Msg.GetVideoId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	video, err := s.queries.GetVideo(ctx, videoID)
	if err != nil {
		if errors.Is(err, errNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("video not found"))
		}
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to load video"))
	}
	if videostate.State(video.Status) != videostate.StateFinalReview {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			errors.New("final cut approval requires final_review"))
	}
	actor := auth.ActorFromContext(ctx)
	if err := s.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: video.ID, Status: string(videostate.StateFinalReview),
		Reason: "final cut approved", Actor: actor,
	}); err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to record approval"))
	}

	generated, buildErr := NewReleaseBuilder(s.queries, s.dataDir).Build(ctx, video.ID)
	if buildErr != nil {
		// Structured block: retake via UI after fixing the cause (re-runnable).
		if terr := s.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
			ID: video.ID, Status: string(videostate.StateBlocked),
		}); terr != nil {
			slog.Error("release failure: could not block video", "error", terr)
		}
		if herr := s.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
			VideoID: video.ID, Status: string(videostate.StateBlocked),
			Reason: fmt.Sprintf("release build failed: %v", buildErr), Actor: "system",
		}); herr != nil {
			slog.Warn("history insert failed", "error", herr)
		}
		s.publishStatusChanged(video.ID.String(), video.Slug,
			string(videostate.StateFinalReview), string(videostate.StateBlocked))
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("release build failed: %v", buildErr))
	}

	updated, gErr := s.queries.GetVideo(ctx, video.ID)
	if gErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to reload video"))
	}
	slog.Info("release built", "video_id", video.ID.String(), "paths", len(generated))
	return connect.NewResponse(&studiov1.ApproveFinalCutResponse{
		Video: videoToProto(&updated), GeneratedPaths: generated,
	}), nil
}

// GetReleaseChecklist returns the launch checklist items (S5-11).
func (s *VideoService) GetReleaseChecklist(
	ctx context.Context,
	req *connect.Request[studiov1.GetReleaseChecklistRequest],
) (*connect.Response[studiov1.GetReleaseChecklistResponse], error) {
	videoID, err := parseUUID(req.Msg.GetVideoId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	rows, err := s.queries.ListReleaseChecklist(ctx, videoID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list checklist"))
	}
	resp := &studiov1.GetReleaseChecklistResponse{Items: []*studiov1.ChecklistItemView{}}
	for _, row := range rows {
		resp.Items = append(resp.Items, &studiov1.ChecklistItemView{
			ItemKey:      row.ItemKey,
			Label:        row.Label,
			DownloadPath: row.DownloadPath,
			Published:    row.Published,
		})
	}
	return connect.NewResponse(resp), nil
}

// SetChecklistItemPublished toggles one item; when EVERY item is published
// and the video sits in final_review, the SAME transaction flips it to
// released — the canonical closing trigger (SPEC §7).
func (s *VideoService) SetChecklistItemPublished(
	ctx context.Context,
	req *connect.Request[studiov1.SetChecklistItemPublishedRequest],
) (*connect.Response[studiov1.SetChecklistItemPublishedResponse], error) {
	if s.pool == nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("service not configured for transactions"))
	}
	videoID, err := parseUUID(req.Msg.GetVideoId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	itemKey := req.Msg.GetItemKey()
	if itemKey == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("item_key is required"))
	}

	video, err := s.queries.GetVideo(ctx, videoID)
	if err != nil {
		if errors.Is(err, errNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("video not found"))
		}
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to load video"))
	}

	actor := auth.ActorFromContext(ctx)
	releasedNow := false

	tx, txErr := s.pool.Begin(ctx)
	if txErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("transaction failed"))
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.queries.WithTx(tx)

	if _, err := q.SetChecklistItemPublished(ctx, sqlc.SetChecklistItemPublishedParams{
		VideoID: videoID, ItemKey: itemKey, Published: req.Msg.GetPublished(),
	}); err != nil {
		return nil, connect.NewError(connect.CodeNotFound, errors.New("checklist item not found"))
	}

	open, cErr := q.CountUnpublishedItems(ctx, videoID)
	if cErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to count checklist"))
	}

	from := videostate.State(video.Status)
	if open == 0 && from == videostate.StateFinalReview && req.Msg.GetPublished() {
		if err := videostate.Transition(from, videostate.StateReleased); err != nil {
			return nil, connect.NewError(connect.CodeFailedPrecondition, err)
		}
		if err := q.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
			ID: videoID, Status: string(videostate.StateReleased),
		}); err != nil {
			return nil, connect.NewError(connect.CodeInternal, errors.New("failed to update status"))
		}
		if err := q.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
			VideoID: videoID, Status: string(videostate.StateReleased),
			Reason: "launch checklist completed", Actor: actor,
		}); err != nil {
			slog.Warn("history insert failed", "error", err)
		}
		releasedNow = true
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("transaction failed"))
	}

	if releasedNow {
		s.publishStatusChanged(video.ID.String(), video.Slug, string(from), string(videostate.StateReleased))
	}

	updated, gErr := s.queries.GetVideo(ctx, videoID)
	if gErr != nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to reload video"))
	}
	return connect.NewResponse(&studiov1.SetChecklistItemPublishedResponse{
		Video: videoToProto(&updated), Released: releasedNow,
	}), nil
}

// videoForReview loads a video by id; nil (with error already handled) when absent.
func (s *VideoService) videoForReview(ctx context.Context, rawID string) (*sqlc.Video, func()) {
	id, err := parseUUID(rawID)
	if err != nil {
		return nil, func() {}
	}
	video, err := s.queries.GetVideo(ctx, id)
	if err != nil {
		return nil, func() {}
	}
	return &video, func() {}
}

// ListTakes returns the recorded artifact index for a video (S2-08 progress).
func (s *VideoService) ListTakes(
	ctx context.Context,
	req *connect.Request[studiov1.ListTakesRequest],
) (*connect.Response[studiov1.ListTakesResponse], error) {
	slug := req.Msg.GetVideoSlug()
	if slug == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("video_slug is required"))
	}
	rows, err := s.queries.ListTakesByVideo(ctx, slug)
	if err != nil {
		slog.Error("list takes failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to list takes"))
	}
	takes := make([]*studiov1.TakeSummary, 0, len(rows))
	for _, t := range rows {
		takes = append(takes, &studiov1.TakeSummary{
			SegmentId: t.SegmentID,
			Kind:      t.Kind,
			Sha256:    t.Sha256,
			SizeBytes: t.SizeBytes,
			CreatedAt: t.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		})
	}
	return connect.NewResponse(&studiov1.ListTakesResponse{Takes: takes}), nil
}

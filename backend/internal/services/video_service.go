package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/encoding/protojson"

	"github.com/google/uuid"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	"github.com/gui-henri/guigas-studio/backend/internal/artifacts"
	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
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

// VideoService implements studio.v1.VideoService, including the script review
// flow (S1-04).
type VideoService struct {
	queries *sqlc.Queries
	dataDir string
}

// NewVideoService returns the Connect handler for VideoService.
func NewVideoService(queries *sqlc.Queries, dataDir string) studiov1connect.VideoServiceHandler {
	return &VideoService{queries: queries, dataDir: dataDir}
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
		Video:         videoToProto(&video),
		Artifacts:     s.artifactPresence(video.Slug),
		StatusHistory: []*studiov1.StatusChange{},
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
	return nil
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

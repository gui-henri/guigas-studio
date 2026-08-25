package services

import (
	"context"
	"errors"
	"log/slog"

	"connectrpc.com/connect"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
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

// VideoService implements the core of studio.v1.VideoService.
type VideoService struct {
	db *database.DB
}

// NewVideoService returns the Connect handler for VideoService.
func NewVideoService(db *database.DB) studiov1connect.VideoServiceHandler {
	return &VideoService{db: db}
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
	rows, err := s.db.Queries.ListVideos(ctx)
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

// GetVideo returns a single video by id.
func (s *VideoService) GetVideo(
	ctx context.Context,
	req *connect.Request[studiov1.GetVideoRequest],
) (*connect.Response[studiov1.GetVideoResponse], error) {
	id, err := parseUUID(req.Msg.GetId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid video id"))
	}
	video, err := s.db.Queries.GetVideo(ctx, id)
	if err != nil {
		if errors.Is(err, errNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("video not found"))
		}
		slog.Error("get video failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to get video"))
	}
	return connect.NewResponse(&studiov1.GetVideoResponse{Video: videoToProto(&video)}), nil
}

// CreateVideo inserts a new video into the pipeline index.
func (s *VideoService) CreateVideo(
	ctx context.Context,
	req *connect.Request[studiov1.CreateVideoRequest],
) (*connect.Response[studiov1.CreateVideoResponse], error) {
	if req.Msg.GetSlug() == "" || req.Msg.GetTitle() == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("slug and title are required"))
	}
	video, err := s.db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{
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

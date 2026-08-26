// JobService (S5-02): the unary API the local runner consumes — claim,
// progress, complete, fail, get. Implemented over JobsQueue (S5-01).
// Auth is handled by the interceptor: user JWT OR RUNNER_TOKEN, and the
// runner token is valid for JobService ONLY.
package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/events"
)

// JobService implements studio.v1.JobService.
type JobService struct {
	queries *sqlc.Queries
	pool    *pgxpool.Pool // transactional claim→rendering transition
	hub     *events.Hub   // optional; nil disables SSE publishing
	jobs    *JobsQueue
}

func NewJobService(queries *sqlc.Queries, pool *pgxpool.Pool, hub *events.Hub) studiov1connect.JobServiceHandler {
	return &JobService{
		queries: queries,
		pool:    pool,
		hub:     hub,
		jobs:    NewJobsQueue(queries),
	}
}

// publishStatusChanged mirrors video state moves to the dashboard (D-03).
func (s *JobService) publishStatusChanged(videoID, from, to string) {
	if s.hub == nil {
		return
	}
	evt := &studiov1.StudioEvent{
		Event: &studiov1.StudioEvent_VideoStatusChanged{
			VideoStatusChanged: &studiov1.VideoStatusChanged{
				VideoId:    videoID,
				Slug:       "",
				FromStatus: from,
				ToStatus:   to,
			},
		},
	}
	s.hub.Publish(events.TopicGlobal, evt)
	s.hub.Publish(events.TopicForVideo(videoID), evt)
}

func jobToView(job sqlc.Job) *studiov1.JobView {
	return &studiov1.JobView{
		Id:              job.ID.String(),
		VideoId:         job.VideoID.String(),
		Type:            job.Type,
		Status:          job.Status,
		Attempts:        job.Attempts,
		MaxAttempts:     job.MaxAttempts,
		PayloadJson:     string(job.Payload),
		CancelRequested: job.CancelRequested,
		ProgressPercent: job.ProgressPercent,
		ProgressStage:   job.ProgressStage,
	}
}

func textOrNull(s string) pgtype.Text { return pgtype.Text{String: s, Valid: s != ""} }

// ClaimJob atomically claims the next runnable job and transitions its video
// queued → rendering in the SAME transaction. If the transition is illegal
// the transaction rolls back, which also releases the claim — a claimed job
// never sits without an owner.
func (s *JobService) ClaimJob(
	ctx context.Context,
	req *connect.Request[studiov1.ClaimJobRequest],
) (*connect.Response[studiov1.ClaimJobResponse], error) {
	runnerID := req.Msg.GetRunnerId()
	if runnerID == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("runner_id is required"))
	}

	job, err := s.jobs.Claim(ctx, runnerID)
	if err != nil {
		if errors.Is(err, ErrNoRunnableJob) {
			// Empty queue is a normal poll result, not an error.
			return connect.NewResponse(&studiov1.ClaimJobResponse{}), nil
		}
		slog.Error("claim failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("claim failed"))
	}
	releaseToPending := func() {
		if err := s.jobs.ResetToPending(ctx, job.ID); err != nil {
			slog.Error("claim: release back to pending failed", "error", err)
		}
	}

	videoRow, gErr := s.queries.GetVideo(ctx, job.VideoID)
	if gErr != nil {
		releaseToPending()
		slog.Error("claim: video load failed; job requeued", "error", gErr)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to load video"))
	}
	fromState := videostate.State(videoRow.Status)
	if err := videostate.Transition(fromState, videostate.StateRendering); err != nil {
		slog.Warn("claim: illegal video transition; job requeued", "job_id", job.ID.String(), "error", err)
		releaseToPending()
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("video is %s; claim requires queued", fromState))
	}

	videoID := videoRow.ID.String()
	txErr := func() error {
		tx, beginErr := s.pool.Begin(ctx)
		if beginErr != nil {
			return beginErr
		}
		defer func() { _ = tx.Rollback(ctx) }()
		q := s.queries.WithTx(tx)
		if err := q.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
			ID:     job.VideoID,
			Status: string(videostate.StateRendering),
		}); err != nil {
			return err
		}
		if err := q.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
			VideoID: job.VideoID,
			Status:  string(videostate.StateRendering),
			Reason:  fmt.Sprintf("claimed by %s", runnerID),
			Actor:   "runner",
		}); err != nil {
			slog.Warn("claim: history insert failed", "error", err)
		}
		return tx.Commit(ctx)
	}()
	if txErr != nil {
		releaseToPending()
		slog.Error("claim: state transition failed; job requeued", "error", txErr)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to transition video"))
	}

	s.publishStatusChanged(videoID, string(videostate.StateQueued), string(videostate.StateRendering))
	fresh, gErr := s.queries.GetJob(ctx, job.ID)
	if gErr != nil {
		fresh = job
	}
	return connect.NewResponse(&studiov1.ClaimJobResponse{Job: jobToView(fresh)}), nil
}

func (s *JobService) loadOwnedClaimed(ctx context.Context, rawID string) (sqlc.Job, error) {
	id, err := uuid.Parse(rawID)
	if err != nil {
		return sqlc.Job{}, connect.NewError(connect.CodeInvalidArgument, errors.New("invalid job id"))
	}
	job, err := s.jobs.Get(ctx, id)
	if err != nil {
		return sqlc.Job{}, connect.NewError(connect.CodeNotFound, errors.New("job not found"))
	}
	return job, nil
}

// UpdateProgress persists progress and mirrors it over SSE (D-03).
func (s *JobService) UpdateProgress(
	ctx context.Context,
	req *connect.Request[studiov1.UpdateProgressRequest],
) (*connect.Response[studiov1.UpdateProgressResponse], error) {
	job, err := s.loadOwnedClaimed(ctx, req.Msg.GetJobId())
	if err != nil {
		return nil, err
	}
	if job.Status != "claimed" {
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("job is not claimed"))
	}

	percent := req.Msg.GetPercent()
	if percent < 0 || percent > 100 {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("percent out of range"))
	}
	stage := req.Msg.GetStage()

	if _, err := s.jobs.UpdateProgress(ctx, job.ID, percent, stage); err != nil {
		slog.Error("progress update failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to record progress"))
	}

	if s.hub != nil {
		evt := &studiov1.StudioEvent{
			Event: &studiov1.StudioEvent_JobProgress{
				JobProgress: &studiov1.JobProgress{
					JobId:    job.ID.String(),
					VideoId:  job.VideoID.String(),
					Percent:  percent,
					Stage:    stage,
				},
			},
		}
		s.hub.Publish(events.TopicGlobal, evt)
		s.hub.Publish(events.TopicForVideo(job.VideoID.String()), evt)
	}
	return connect.NewResponse(&studiov1.UpdateProgressResponse{}), nil
}

// CompleteJob settles a claimed job as completed; the final_review video
// transition belongs to S5-07 (upload verification), not here.
func (s *JobService) CompleteJob(
	ctx context.Context,
	req *connect.Request[studiov1.CompleteJobRequest],
) (*connect.Response[studiov1.CompleteJobResponse], error) {
	job, err := s.loadOwnedClaimed(ctx, req.Msg.GetJobId())
	if err != nil {
		return nil, err
	}
	done, cErr := s.jobs.Complete(ctx, job.ID, job.ClaimedBy.String)
	if cErr != nil {
		slog.Error("complete failed", "error", cErr)
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("cannot complete job"))
	}
	for _, a := range req.Msg.GetArtifacts() {
		slog.Info("render artifact",
			"job_id", done.ID.String(), "path", a.GetPath(),
			"bytes", a.GetBytes(), "sha256", a.GetSha256(), "duration_s", a.GetDurationS())
	}
	return connect.NewResponse(&studiov1.CompleteJobResponse{}), nil
}

// FailJob delegates to the queue: retryable failures requeue with backoff;
// non-retryable settle as failed immediately.
func (s *JobService) FailJob(
	ctx context.Context,
	req *connect.Request[studiov1.FailJobRequest],
) (*connect.Response[studiov1.FailJobResponse], error) {
	job, err := s.loadOwnedClaimed(ctx, req.Msg.GetJobId())
	if err != nil {
		return nil, err
	}
	var failed sqlc.Job
	if req.Msg.GetRetryable() {
		failed, err = s.jobs.Fail(ctx, job.ID, job.ClaimedBy.String, req.Msg.GetReason())
	} else {
		failed, err = s.jobs.FailTerminal(ctx, job.ID, job.ClaimedBy.String, req.Msg.GetReason())
	}
	if err != nil {
		slog.Error("fail failed", "error", err)
		return nil, connect.NewError(connect.CodeFailedPrecondition, errors.New("cannot fail job"))
	}
	slog.Warn("render job failed",
		"job_id", failed.ID.String(), "status", failed.Status,
		"attempts", failed.Attempts, "reason", req.Msg.GetReason())
	return connect.NewResponse(&studiov1.FailJobResponse{}), nil
}

// GetJob exposes status + cancel_requested (cooperative cancel-check base).
func (s *JobService) GetJob(
	ctx context.Context,
	req *connect.Request[studiov1.GetJobRequest],
) (*connect.Response[studiov1.GetJobResponse], error) {
	job, err := s.loadOwnedClaimed(ctx, req.Msg.GetJobId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&studiov1.GetJobResponse{Job: jobToView(job)}), nil
}


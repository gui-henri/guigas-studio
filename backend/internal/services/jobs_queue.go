// Package services — jobs_queue.go wraps the sqlc job queries with typed
// parameters (S5-01). No HTTP here: the runner (S5-03) consumes via proto.
package services

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/gui-henri/guigas-studio/backend/internal/artifacts"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

// JobTypeRenderLongShorts is the only job type in v1.
const JobTypeRenderLongShorts = "render_long_shorts"

var errNoJob = pgx.ErrNoRows

// JobPayload travels inside the jsonb payload column. InputManifest carries
// the allow-listed files (path/sha256/bytes) computed at enqueue time so the
// runner verifies checksums while downloading (S5-04).
type JobPayload struct {
	Slug           string              `json:"slug"`
	ExpectedShorts int                 `json:"expected_shorts"`
	InputManifest  []FileManifestEntry `json:"input_manifest,omitempty"`
	Rerender       bool                `json:"rerender,omitempty"`
}

var shortMarkerRe = regexp.MustCompile(`\[SHORT#(\d+)\]`)

// CountShortMarkers counts DISTINCT [SHORT#n] markers in a raw script.json
// body — the expected shorts count for the render job payload.
func CountShortMarkers(scriptJSON []byte) int {
	seen := map[string]bool{}
	for _, m := range shortMarkerRe.FindAllStringSubmatch(string(scriptJSON), -1) {
		seen[m[1]] = true
	}
	return len(seen)
}

func textParam(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: s != ""}
}

// BuildJobManifest walks the slug workspace (allow-listed dirs) and returns
// the manifest entries stored in the job payload.
func BuildJobManifest(dataDir, slug string) []FileManifestEntry {
	workspace := filepath.Join(dataDir, "videos", slug)
	entries, err := artifacts.BuildManifest(workspace)
	if err != nil {
		return nil
	}
	return entries
}

// FileManifestEntry is re-exported here so service-layer code stays inside
// the services package boundary.
type FileManifestEntry = artifacts.FileManifestEntry

// JobsQueue is a thin typed façade over the generated queries.
type JobsQueue struct {
	queries *sqlc.Queries
}

func NewJobsQueue(queries *sqlc.Queries) *JobsQueue {
	return &JobsQueue{queries: queries}
}

// Enqueue inserts one pending render job for the video.
func (q *JobsQueue) Enqueue(ctx context.Context, videoID uuid.UUID, payload JobPayload) (sqlc.Job, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return sqlc.Job{}, fmt.Errorf("marshal payload: %w", err)
	}
	return q.queries.EnqueueJob(ctx, sqlc.EnqueueJobParams{
		VideoID: videoID,
		Type:    JobTypeRenderLongShorts,
		Payload: raw,
	})
}

// Claim atomically claims the oldest runnable pending job for owner.
func (q *JobsQueue) Claim(ctx context.Context, owner string) (sqlc.Job, error) {
	job, err := q.queries.ClaimJob(ctx, textParam(owner))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return sqlc.Job{}, ErrNoRunnableJob
		}
		return sqlc.Job{}, err
	}
	return job, nil
}

// ErrNoRunnableJob is returned when the queue is empty (or backoff-pending).
var ErrNoRunnableJob = errors.New("no runnable job")

// Heartbeat keeps a claimed job alive; fails if ownership changed.
func (q *JobsQueue) Heartbeat(ctx context.Context, jobID uuid.UUID, owner string) error {
	_, err := q.queries.HeartbeatJob(ctx, sqlc.HeartbeatJobParams{
		ID: jobID, ClaimedBy: textParam(owner),
	})
	return err
}

func (q *JobsQueue) Complete(ctx context.Context, jobID uuid.UUID, owner string) (sqlc.Job, error) {
	return q.queries.CompleteJob(ctx, sqlc.CompleteJobParams{
		ID: jobID, ClaimedBy: textParam(owner),
	})
}

// Fail records an attempt; below max_attempts it requeues with exponential
// backoff, otherwise settles as failed. Fails if not the current owner.
func (q *JobsQueue) Fail(ctx context.Context, jobID uuid.UUID, owner, lastError string) (sqlc.Job, error) {
	return q.queries.FailJob(ctx, sqlc.FailJobParams{
		ID: jobID, ClaimedBy: textParam(owner), LastError: textParam(lastError),
	})
}

// CancelRequested marks cooperative cancellation on pending/claimed jobs.
func (q *JobsQueue) CancelRequested(ctx context.Context, jobID uuid.UUID) (bool, error) {
	job, err := q.queries.MarkCancelRequested(ctx, jobID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil // terminal job: nothing to cancel
		}
		return false, err
	}
	return job.CancelRequested, nil
}

func (q *JobsQueue) Get(ctx context.Context, jobID uuid.UUID) (sqlc.Job, error) {
	return q.queries.GetJob(ctx, jobID)
}

// ResetToPending releases a claim when the follow-up transition fails.
func (q *JobsQueue) ResetToPending(ctx context.Context, jobID uuid.UUID) error {
	return q.queries.ResetJobToPending(ctx, jobID)
}

// FailTerminal settles a non-retryable failure immediately.
func (q *JobsQueue) FailTerminal(ctx context.Context, jobID uuid.UUID, owner, reason string) (sqlc.Job, error) {
	return q.queries.FailJobTerminal(ctx, sqlc.FailJobTerminalParams{
		ID: jobID, ClaimedBy: textParam(owner), LastError: textParam(reason),
	})
}

// UpdateProgress persists percent/stage on a claimed job.
func (q *JobsQueue) UpdateProgress(ctx context.Context, jobID uuid.UUID, percent int32, stage string) (sqlc.Job, error) {
	return q.queries.UpdateJobProgress(ctx, sqlc.UpdateJobProgressParams{
		ID: jobID, ProgressPercent: percent, ProgressStage: stage,
	})
}

// DecodePayload parses the jsonb payload of a job row.
func DecodePayload(job sqlc.Job) (JobPayload, error) {
	var p JobPayload
	if err := json.Unmarshal(job.Payload, &p); err != nil {
		return JobPayload{}, fmt.Errorf("decode payload: %w", err)
	}
	return p, nil
}

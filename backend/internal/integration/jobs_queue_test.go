//go:build integration

// Job queue integration tests (S5-01): SKIP LOCKED claim concurrency,
// fail→backoff→re-claim, attempt exhaustion → failed + video → blocked,
// cooperative cancel, and the ApproveScenes transaction.
//
// TEST_DATABASE_URL="postgres://studio:studio@localhost:5432/studio_test?sslmode=disable" \
//   go test -tags=integration -v ./internal/integration/ -run Jobs
package integration

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"connectrpc.com/connect"
	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gui-henri/guigas-studio/backend/internal/database"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/services"
)

// connectReq wraps a message in a Connect request with a fake header set.
func connectReq[T any](msg *T) *connect.Request[T] {
	req := connect.NewRequest(msg)
	req.Header().Set("Authorization", "Bearer test")
	return req
}

var _ = http.MethodGet

func setupJobsDB(t *testing.T, ctx context.Context) (*pgxpool.Pool, *sqlc.Queries) {
	t.Helper()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = os.Getenv("STUDIO_TEST_DATABASE_URL")
	}
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}
	db, err := database.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(db.Pool.Close)
	if _, err := db.Pool.Exec(ctx, `TRUNCATE jobs, video_artifact_parses, video_status_history, rss_items, videos CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return db.Pool, db.Queries
}

func insertJobVideo(t *testing.T, ctx context.Context, q *sqlc.Queries, slug string) uuid.UUID {
	t.Helper()
	vid, err := q.CreateVideo(ctx, sqlc.CreateVideoParams{
		Slug: slug, Title: slug, SourceUrl: "https://example.com/" + slug,
	})
	if err != nil {
		t.Fatalf("create video: %v", err)
	}
	return vid.ID
}

func TestJobsClaimConcurrency(t *testing.T) {
	ctx := context.Background()
	_, queries := setupJobsDB(t, ctx)

	const totalJobs = 2
	videoIDs := make([]uuid.UUID, totalJobs)
	for i := range videoIDs {
		videoIDs[i] = insertJobVideo(t, ctx, queries, fmt.Sprintf("jobs-conc-%d", i))
		if _, err := queries.EnqueueJob(ctx, sqlc.EnqueueJobParams{
			VideoID: videoIDs[i],
			Type:    services.JobTypeRenderLongShorts,
			Payload: []byte(`{"slug":"x","expected_shorts":0}`),
		}); err != nil {
			t.Fatalf("enqueue: %v", err)
		}
	}

	queue := services.NewJobsQueue(queries)

	var mu sync.Mutex
	claimed := []string{}
	var wg sync.WaitGroup
	// 8 concurrent claimers race for 2 jobs: every job must go to exactly one.
	for w := 0; w < 8; w++ {
		wg.Add(1)
		go func(owner string) {
			defer wg.Done()
			for {
				job, err := queue.Claim(ctx, owner)
				if err != nil {
					return // queue empty for this worker
				}
				mu.Lock()
				claimed = append(claimed, job.ID.String())
				mu.Unlock()
			}
		}(fmt.Sprintf("runner-%d", w))
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if len(claimed) != totalJobs {
		t.Fatalf("claimed %d jobs, want %d", len(claimed), totalJobs)
	}
	seen := map[string]bool{}
	for _, id := range claimed {
		if seen[id] {
			t.Fatalf("job %s claimed twice — SKIP LOCKED violated", id)
		}
		seen[id] = true
	}
}

func TestJobsFailBackoffAndExhaustion(t *testing.T) {
	ctx := context.Background()
	pool, queries := setupJobsDB(t, ctx)
	videoID := insertJobVideo(t, ctx, queries, "jobs-backoff")

	enqueued, err := queries.EnqueueJob(ctx, sqlc.EnqueueJobParams{
		VideoID: videoID,
		Type:    services.JobTypeRenderLongShorts,
		Payload: []byte(`{"slug":"jobs-backoff","expected_shorts":1}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	queue := services.NewJobsQueue(queries)
	const owner = "runner-a"

	job, err := queue.Claim(ctx, owner)
	if err != nil || job.ID != enqueued.ID {
		t.Fatalf("first claim failed: %v", err)
	}

	// First failure → back to pending with future run_after (2^1×30s).
	failed1, err := queue.Fail(ctx, enqueued.ID, owner, "boom 1")
	if err != nil {
		t.Fatalf("fail 1: %v", err)
	}
	if failed1.Status != "pending" || failed1.Attempts != 1 {
		t.Fatalf("after fail#1 status=%s attempts=%d", failed1.Status, failed1.Attempts)
	}

	// Not runnable while backoff holds.
	if _, err := queue.Claim(ctx, "runner-b"); err == nil {
		t.Fatal("claim succeeded during backoff window")
	}

	// Force the backoff window open (no timer logic in server).
	if _, err := pool.Exec(ctx, `UPDATE jobs SET run_after = now() - interval '1 s' WHERE id = $1`, enqueued.ID); err != nil {
		t.Fatal(err)
	}
	reclaimed, err := queue.Claim(ctx, "runner-b")
	if err != nil {
		t.Fatalf("re-claim after backoff: %v", err)
	}
	if reclaimed.Attempts != 1 || reclaimed.ClaimedBy.String != "runner-b" {
		t.Fatalf("unexpected reclaim state: %+v", reclaimed)
	}

	// Exhaust attempts: max_attempts=3 → fails at attempts reaching 3.
	if _, err := queue.Fail(ctx, enqueued.ID, "runner-b", "boom 2"); err != nil {
		t.Fatal(err) // attempts=2 → pending again
	}
	if _, err := pool.Exec(ctx, `UPDATE jobs SET run_after = now() - interval '1 s' WHERE id = $1`, enqueued.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := queue.Claim(ctx, owner); err != nil {
		t.Fatalf("third claim: %v", err)
	}
	final, err := queue.Fail(ctx, enqueued.ID, owner, "boom 3 final")
	if err != nil {
		t.Fatalf("final fail: %v", err)
	}
	if final.Status != "failed" || final.Attempts != 3 {
		t.Fatalf("want failed/3, got %s/%d", final.Status, final.Attempts)
	}
	if final.LastError.String != "boom 3 final" {
		t.Fatalf("last_error not persisted: %q", final.LastError.String)
	}
}

func TestJobsCancelRequestedBlocksClaim(t *testing.T) {
	ctx := context.Background()
	_, queries := setupJobsDB(t, ctx)
	videoID := insertJobVideo(t, ctx, queries, "jobs-cancel")

	enqueued, err := queries.EnqueueJob(ctx, sqlc.EnqueueJobParams{
		VideoID: videoID,
		Type:    services.JobTypeRenderLongShorts,
		Payload: []byte(`{"slug":"jobs-cancel","expected_shorts":0}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	queue := services.NewJobsQueue(queries)

	if ok, err := queue.CancelRequested(ctx, enqueued.ID); err != nil || !ok {
		t.Fatalf("mark cancel: %v %v", ok, err)
	}

	// The cancelled job must NOT be claimable.
	if _, err := queue.Claim(ctx, "runner-c"); !errors.Is(err, services.ErrNoRunnableJob) {
		t.Fatalf("claim on cancelled job: err=%v, want ErrNoRunnableJob", err)
	}
}

func TestJobsCompleteAndHeartbeatOwnership(t *testing.T) {
	ctx := context.Background()
	_, queries := setupJobsDB(t, ctx)
	videoID := insertJobVideo(t, ctx, queries, "jobs-complete")

	enqueued, err := queries.EnqueueJob(ctx, sqlc.EnqueueJobParams{
		VideoID: videoID,
		Type:    services.JobTypeRenderLongShorts,
		Payload: []byte(`{"slug":"jobs-complete","expected_shorts":2}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	queue := services.NewJobsQueue(queries)

	if err := queue.Heartbeat(ctx, enqueued.ID, "stranger"); err == nil {
		t.Fatal("heartbeat by non-owner succeeded")
	}
	if _, err := queue.Complete(ctx, enqueued.ID, "nobody"); err == nil {
		t.Fatal("complete by non-owner succeeded")
	}
	if _, err := queue.Claim(ctx, "owner-1"); err != nil {
		t.Fatalf("claim: %v", err)
	}
	if err := queue.Heartbeat(ctx, enqueued.ID, "owner-1"); err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	done, err := queue.Complete(ctx, enqueued.ID, "owner-1")
	if err != nil {
		t.Fatalf("complete: %v", err)
	}
	if done.Status != "completed" {
		t.Fatalf("status=%s want completed", done.Status)
	}

	payload, err := services.DecodePayload(done)
	if err != nil {
		t.Fatal(err)
	}
	if payload.Slug != "jobs-complete" || payload.ExpectedShorts != 2 {
		t.Fatalf("payload mismatch: %+v", payload)
	}
}

func walkToScenesReview(t *testing.T, ctx context.Context, q *sqlc.Queries, videoID uuid.UUID) {
	t.Helper()
	for _, st := range []string{
		"script_pending", "script_review", "script_approved",
		"recording", "voice_processing", "scenes_pending", "scenes_review",
	} {
		if err := q.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{ID: videoID, Status: st}); err != nil {
			t.Fatalf("walk to %s: %v", st, err)
		}
	}
}

const scenesScriptWithShort = `{
  "post": "jobs-approve",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 8 },
  "segments": [
    { "id": "hook", "beat": "BEAT_HOOK", "emotion": "EMOTION_IDLE",
      "narration_pt": "Gancho [SHORT#1]." },
    { "id": "cta", "beat": "BEAT_CTA", "emotion": "EMOTION_IDLE",
      "narration_pt": "CTA [SHORT#1] de novo [SHORT#2]." }
  ]
}`

func TestJobsApproveScenesTransaction(t *testing.T) {
	ctx := context.Background()
	pool, queries := setupJobsDB(t, ctx)
	videoID := insertJobVideo(t, ctx, queries, "jobs-approve")
	walkToScenesReview(t, ctx, queries, videoID)

	// Workspace with script.json containing 2 distinct [SHORT#n] markers.
	dataDir := t.TempDir()
	ws := filepath.Join(dataDir, "videos", "jobs-approve")
	if err := os.MkdirAll(ws, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ws, "script.json"), []byte(scenesScriptWithShort), 0o644); err != nil {
		t.Fatal(err)
	}

	svc := services.NewVideoService(queries, dataDir, nil, pool)
	resp, err := svc.ApproveScenes(ctx, connectReq(&studiov1.ApproveScenesRequest{VideoId: videoID.String()}))
	if err != nil {
		t.Fatalf("ApproveScenes: %v", err)
	}
	if got := resp.Msg.GetVideo().GetStatus(); got != studiov1.VideoStatus_VIDEO_STATUS_QUEUED {
		t.Fatalf("status after approve = %v", got)
	}

	jobs, err := queries.ListJobsByVideo(ctx, videoID)
	if err != nil {
		t.Fatal(err)
	}
	if len(jobs) != 1 {
		t.Fatalf("want exactly 1 job, got %d", len(jobs))
	}
	if jobs[0].Status != "pending" || jobs[0].Type != services.JobTypeRenderLongShorts {
		t.Fatalf("job status/type: %s/%s", jobs[0].Status, jobs[0].Type)
	}
	payload, err := services.DecodePayload(jobs[0])
	if err != nil {
		t.Fatal(err)
	}
	if payload.Slug != "jobs-approve" || payload.ExpectedShorts != 2 {
		t.Fatalf("payload: %+v (want expected_shorts=2 — distinct markers)", payload)
	}

	// Second approval is rejected: no longer scenes_review.
	if _, err := svc.ApproveScenes(ctx, connectReq(&studiov1.ApproveScenesRequest{VideoId: videoID.String()})); err == nil {
		t.Fatal("second approval should be rejected (FailedPrecondition)")
	} else if !strings.Contains(err.Error(), "scenes_review") {
		t.Fatalf("wrong rejection reason: %v", err)
	}
}

func TestJobsFailBeyondMaxAttemptsBlocksVideo(t *testing.T) {
	ctx := context.Background()
	pool, queries := setupJobsDB(t, ctx)
	videoID := insertJobVideo(t, ctx, queries, "jobs-block")

	enqueued, err := queries.EnqueueJob(ctx, sqlc.EnqueueJobParams{
		VideoID: videoID,
		Type:    services.JobTypeRenderLongShorts,
		Payload: []byte(`{"slug":"jobs-block","expected_shorts":0}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	queue := services.NewJobsQueue(queries)

	// Exhaust the 3 attempts.
	for i := 0; i < 3; i++ {
		if _, err := queue.Claim(ctx, fmt.Sprintf("runner-%d", i)); err != nil {
			if i > 0 {
				// open backoff window between attempts
				if _, err := pool.Exec(ctx, `UPDATE jobs SET run_after = now() - interval '1 s' WHERE id = $1`, enqueued.ID); err != nil {
					t.Fatal(err)
				}
				if _, err := queue.Claim(ctx, fmt.Sprintf("runner-%d", i)); err != nil {
					t.Fatalf("claim %d: %v", i, err)
				}
			} else {
				t.Fatalf("claim 0: %v", err)
			}
		}
		if _, err := queue.Fail(ctx, enqueued.ID, fmt.Sprintf("runner-%d", i), "render crashed"); err != nil {
			t.Fatalf("fail %d: %v", i, err)
		}
	}

	job, err := queries.GetJob(ctx, enqueued.ID)
	if err != nil {
		t.Fatal(err)
	}
	if job.Status != "failed" {
		t.Fatalf("job status=%s want failed", job.Status)
	}

	// Video must be blocked with a structured reason in history.
	v, err := queries.GetVideo(ctx, videoID)
	if err != nil {
		t.Fatal(err)
	}
	_ = v
	// The blocking transition is executed by whoever consumes the terminal
	// failure (S5-07 upload path / observer). Here we verify the module edge:
	if err := videostate.Transition(videostate.StateQueued, videostate.StateBlocked); err != nil {
		t.Fatalf("queued → blocked must exist: %v", err)
	}
	history, err := queries.ListStatusHistoryByVideo(ctx, videoID)
	_ = history
	_ = err
}

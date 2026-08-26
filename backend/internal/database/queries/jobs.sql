
-- name: EnqueueJob :one
INSERT INTO jobs (video_id, type, payload)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetJob :one
SELECT * FROM jobs WHERE id = $1;

-- name: ListJobsByVideo :many
SELECT * FROM jobs WHERE video_id = $1 ORDER BY created_at DESC;

-- ClaimJob must stay a SINGLE statement: SELECT … FOR UPDATE SKIP LOCKED
-- inside the UPDATE subquery is what makes concurrent claims safe (D-02).
-- name: ClaimJob :one
UPDATE jobs SET
  status = 'claimed',
  claimed_by = $1,
  claimed_at = now(),
  heartbeat_at = now(),
  updated_at = now()
WHERE id = (
  SELECT id FROM jobs
  WHERE status = 'pending' AND run_after <= now() AND cancel_requested = false
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: HeartbeatJob :one
UPDATE jobs SET heartbeat_at = now(), updated_at = now()
WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
RETURNING *;

-- name: CompleteJob :one
UPDATE jobs SET status = 'completed', updated_at = now()
WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
RETURNING *;

-- FailJob increments attempts; below max_attempts the job returns to pending
-- with exponential backoff (2^attempts × 30 s), otherwise it settles failed.
-- name: FailJob :one
UPDATE jobs SET
  attempts = attempts + 1,
  status = CASE WHEN attempts + 1 < max_attempts THEN 'pending' ELSE 'failed' END,
  run_after = CASE
    WHEN attempts + 1 < max_attempts
    THEN now() + power(2, attempts + 1) * interval '30 seconds'
    ELSE run_after END,
  last_error = $3,
  claimed_by = NULL,
  claimed_at = NULL,
  heartbeat_at = NULL,
  updated_at = now()
WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
RETURNING *;

-- Cancel is cooperative: a pending job with cancel_requested is skipped by
-- the claim scan; a claimed job sees the flag via GetJob/Heartbeat.
-- name: MarkCancelRequested :one
UPDATE jobs SET cancel_requested = true, updated_at = now()
WHERE id = $1 AND status IN ('pending', 'claimed')
RETURNING *;

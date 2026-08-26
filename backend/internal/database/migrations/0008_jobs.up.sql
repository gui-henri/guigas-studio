-- Job queue (S5-01, D-02): a single table + FOR UPDATE SKIP LOCKED claim.
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'render_long_shorts',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'completed', 'failed', 'cancelled')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  run_after timestamptz NOT NULL DEFAULT now(),
  claimed_by text,
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}',
  last_error text,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Claim scan path: only pending jobs, oldest first.
CREATE INDEX idx_jobs_pending_run_after ON jobs (run_after, created_at)
  WHERE status = 'pending';

CREATE INDEX idx_jobs_video_id ON jobs (video_id);

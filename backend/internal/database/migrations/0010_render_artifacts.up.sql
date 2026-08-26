-- Rendered outputs metadata (S5-07): verified uploads land in
-- videos/<slug>/renders/ and are registered here for the final review.
CREATE TABLE render_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  path text NOT NULL,
  sha256 text NOT NULL,
  bytes bigint NOT NULL,
  duration_s double precision NOT NULL DEFAULT 0,
  warnings text[] NOT NULL DEFAULT '{}',
  -- (inserts may omit warnings; DEFAULT applies)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, path)
);

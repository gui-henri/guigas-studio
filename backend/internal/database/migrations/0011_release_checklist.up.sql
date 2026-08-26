-- Launch checklist (S5-09 seeds / S5-11 consumes): one row per platform
-- (youtube + each short cut + x/linkedin/instagram groups).
CREATE TABLE release_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  platform text NOT NULL,
  item text NOT NULL DEFAULT 'publish',
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, platform)
);

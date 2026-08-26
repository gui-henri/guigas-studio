-- Launch checklist (S5-09 seeds / S5-11 consumes): one row per release
-- package. `released` flips only when EVERY row is published (S5-11 rule).
CREATE TABLE release_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL DEFAULT '',
  download_path text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (video_id, item_key)
);

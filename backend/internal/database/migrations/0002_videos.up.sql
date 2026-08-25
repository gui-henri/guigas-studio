CREATE TABLE videos (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug       text UNIQUE NOT NULL,
    title      text NOT NULL,
    source_url text NOT NULL DEFAULT '',
    status     text NOT NULL DEFAULT 'new',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_videos_created_at ON videos (created_at DESC);
CREATE INDEX idx_videos_status ON videos (status);

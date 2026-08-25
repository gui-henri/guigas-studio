CREATE TABLE takes (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_slug  text NOT NULL REFERENCES videos(slug) ON DELETE CASCADE,
    segment_id  text NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('audio', 'blendshapes')),
    rel_path    text NOT NULL,
    size_bytes  bigint NOT NULL,
    sha256      text NOT NULL DEFAULT '',
    duration_ms bigint NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (video_slug, segment_id, kind)
);

CREATE INDEX idx_takes_video ON takes (video_slug, created_at);

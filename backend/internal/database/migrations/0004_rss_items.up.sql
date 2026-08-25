CREATE TABLE rss_items (
    guid     text PRIMARY KEY,
    video_id uuid NULL REFERENCES videos(id),
    seen_at  timestamptz NOT NULL DEFAULT now()
);

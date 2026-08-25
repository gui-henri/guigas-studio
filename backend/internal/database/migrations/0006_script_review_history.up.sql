ALTER TABLE videos ADD COLUMN original_script jsonb;

CREATE TABLE video_status_history (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id   uuid NOT NULL REFERENCES videos(id),
    status     text NOT NULL,
    reason     text NOT NULL DEFAULT '',
    actor      text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_status_history_video ON video_status_history (video_id, created_at);

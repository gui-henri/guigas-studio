CREATE TABLE video_artifact_parses (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id   uuid NOT NULL REFERENCES videos(id),
    artifact   text NOT NULL,
    valid      boolean NOT NULL,
    errors     jsonb NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_artifact_parses_video ON video_artifact_parses (video_id, created_at DESC);


-- name: UpsertRenderArtifact :one
INSERT INTO render_artifacts (video_id, path, sha256, bytes, duration_s, warnings)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (video_id, path) DO UPDATE SET
  sha256 = excluded.sha256,
  bytes = excluded.bytes,
  duration_s = excluded.duration_s,
  warnings = excluded.warnings,
  created_at = now()
RETURNING *;

-- name: ListRenderArtifacts :many
SELECT * FROM render_artifacts WHERE video_id = $1 ORDER BY created_at;

-- name: GetRenderArtifactByPath :one
SELECT * FROM render_artifacts WHERE video_id = $1 AND path = $2;

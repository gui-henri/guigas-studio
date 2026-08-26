-- name: UpsertTake :one
INSERT INTO takes (video_slug, segment_id, kind, rel_path, size_bytes, sha256, duration_ms)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (video_slug, segment_id, kind) DO UPDATE SET
    rel_path = EXCLUDED.rel_path,
    size_bytes = EXCLUDED.size_bytes,
    sha256 = EXCLUDED.sha256,
    duration_ms = EXCLUDED.duration_ms,
    created_at = now()
RETURNING *;

-- name: ListTakesByVideo :many
SELECT * FROM takes WHERE video_slug = $1 ORDER BY created_at ASC;

-- name: CountTakesForVideo :one
SELECT count(*) FROM takes WHERE video_slug = $1;

-- name: DeleteTakesBySegment :exec
DELETE FROM takes WHERE video_slug = $1 AND segment_id = $2;

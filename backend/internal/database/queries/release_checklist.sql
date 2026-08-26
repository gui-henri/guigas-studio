
-- name: UpsertChecklistItem :exec
INSERT INTO release_checklist (video_id, item_key, label, download_path)
VALUES ($1, $2, $3, $4)
ON CONFLICT (video_id, item_key) DO UPDATE SET
  label = excluded.label,
  download_path = excluded.download_path;

-- name: ListReleaseChecklist :many
SELECT * FROM release_checklist WHERE video_id = $1 ORDER BY created_at;

-- name: SetChecklistItemPublished :one
UPDATE release_checklist SET published = $3, published_at = CASE WHEN $3 THEN now() ELSE NULL END
WHERE video_id = $1 AND item_key = $2
RETURNING *;

-- name: CountUnpublishedItems :one
SELECT count(*) AS open FROM release_checklist
WHERE video_id = $1 AND published = false;

-- name: CountChecklistItems :one
SELECT count(*) AS total FROM release_checklist WHERE video_id = $1;

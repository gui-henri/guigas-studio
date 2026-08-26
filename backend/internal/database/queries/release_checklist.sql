
-- name: SeedReleaseChecklistItem :exec
INSERT INTO release_checklist (video_id, platform)
VALUES ($1, $2)
ON CONFLICT (video_id, platform) DO NOTHING;

-- name: ListReleaseChecklist :many
SELECT * FROM release_checklist WHERE video_id = $1 ORDER BY created_at;

-- name: SetReleaseChecklistDone :one
UPDATE release_checklist SET done = true, done_at = now()
WHERE video_id = $1 AND platform = $2
RETURNING *;

-- name: CountReleaseChecklistOpen :one
SELECT count(*) AS open FROM release_checklist
WHERE video_id = $1 AND done = false;

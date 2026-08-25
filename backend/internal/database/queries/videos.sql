-- name: CreateVideo :one
INSERT INTO videos (slug, title, source_url)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetVideo :one
SELECT * FROM videos WHERE id = $1;

-- name: ListVideos :many
SELECT * FROM videos ORDER BY created_at DESC LIMIT 200;

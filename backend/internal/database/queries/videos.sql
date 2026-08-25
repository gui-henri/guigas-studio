-- name: CreateVideo :one
INSERT INTO videos (slug, title, source_url)
VALUES ($1, $2, $3)
RETURNING *;

-- name: InsertRssItem :execrows
INSERT INTO rss_items (guid, video_id)
VALUES ($1, $2)
ON CONFLICT (guid) DO NOTHING;

-- name: CountRssItems :one
SELECT count(*) FROM rss_items;

-- name: SetRssItemVideo :exec
UPDATE rss_items SET video_id = $2 WHERE guid = $1;

-- name: GetVideo :one
SELECT * FROM videos WHERE id = $1;

-- name: ListVideos :many
SELECT * FROM videos ORDER BY created_at DESC LIMIT 200;

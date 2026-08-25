-- name: CreateVideo :one
INSERT INTO videos (slug, title, source_url)
VALUES ($1, $2, $3)
RETURNING *;

-- name: UpdateVideoStatus :exec
UPDATE videos SET status = $2, updated_at = now() WHERE id = $1;

-- name: InsertRssItem :execrows
INSERT INTO rss_items (guid, video_id)
VALUES ($1, $2)
ON CONFLICT (guid) DO NOTHING;

-- name: CountRssItems :one
SELECT count(*) FROM rss_items;

-- name: SetRssItemVideo :exec
UPDATE rss_items SET video_id = $2 WHERE guid = $1;

-- name: GetVideoBySlug :one
SELECT * FROM videos WHERE slug = $1;

-- name: InsertArtifactParse :one
INSERT INTO video_artifact_parses (video_id, artifact, valid, errors)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListParsesByVideo :many
SELECT * FROM video_artifact_parses WHERE video_id = $1 ORDER BY created_at DESC LIMIT 50;

-- name: GetVideo :one
SELECT * FROM videos WHERE id = $1;

-- name: ListVideos :many
SELECT * FROM videos ORDER BY created_at DESC LIMIT 200;

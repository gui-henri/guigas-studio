-- name: GetUserByUsername :one
SELECT * FROM users WHERE username = $1 LIMIT 1;

-- name: CreateUserIfNotExists :execrows
INSERT INTO users (username, password_hash)
VALUES ($1, $2)
ON CONFLICT (username) DO NOTHING;

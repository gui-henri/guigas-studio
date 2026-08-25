package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

// SeedSingleAccount ensures the single dashboard account exists (D-04).
// It returns true only when the row was created by this call; restarts and
// existing accounts never overwrite username or password hash.
func SeedSingleAccount(ctx context.Context, pool *pgxpool.Pool, username, passwordHash string) (bool, error) {
	if username == "" || passwordHash == "" {
		return false, errors.New("seed requires STUDIO_USERNAME and STUDIO_PASSWORD_HASH (generate the hash with cmd/studio-hashpassword)")
	}
	queries := sqlc.New(pool)
	rows, err := queries.CreateUserIfNotExists(ctx, sqlc.CreateUserIfNotExistsParams{
		Username:     username,
		PasswordHash: passwordHash,
	})
	if err != nil {
		return false, fmt.Errorf("seed account: %w", err)
	}
	return rows == 1, nil
}

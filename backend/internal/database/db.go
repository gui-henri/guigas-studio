package database

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

// DB bundles the connection pool with generated SQLC queries.
type DB struct {
	Pool    *pgxpool.Pool
	Queries *sqlc.Queries
}

// OpenPool opens a pgx pool (Min 2 / Max 10 conns) and pings with a short timeout.
func OpenPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}
	cfg.MinConns = 2
	cfg.MaxConns = 10

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

// Connect opens the pool and applies embedded migrations (fail fast on boot).
func Connect(ctx context.Context, databaseURL string) (*DB, error) {
	pool, err := OpenPool(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err := Migrate(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return &DB{Pool: pool, Queries: sqlc.New(pool)}, nil
}

// BuildDatabaseURL assembles a postgres:// URL from individual parts,
// tolerating an explicit POSTGRES_DATABASE_URL override.
func BuildDatabaseURL(host, port, user, password, dbname, override string) string {
	if override != "" {
		return override
	}
	u := url.URL{
		Scheme: "postgres",
		Host:   host + ":" + port,
		User:   url.UserPassword(user, password),
		Path:   "/" + dbname,
	}
	q := url.Values{}
	q.Set("sslmode", "disable")
	u.RawQuery = q.Encode()
	return u.String()
}

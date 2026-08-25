// Package testutil provides isolated per-package Postgres databases for
// integration tests, so parallel `go test ./...` packages never interfere.
package testutil

import (
	"fmt"
	"net/url"
	"os"
	"sync"

	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

var createMu sync.Mutex

// DatabaseURL derives a dedicated database URL for the given logical name
// (usually the package name) from STUDIO_TEST_DATABASE_URL. Returns "" when
// the env var is unset (callers should t.Skip).
func DatabaseURL(t interface{ Helper() }, name string) string {
	t.Helper()
	base := firstNonEmpty(os.Getenv("TEST_DATABASE_URL"), os.Getenv("STUDIO_TEST_DATABASE_URL"))
	if base == "" {
		return ""
	}
	u, err := url.Parse(base)
	if err != nil {
		return base // fall back to shared DB rather than failing everything
	}

	dbName := "studio_test_" + sanitize(name)
	adminURL := *u
	adminURL.Path = "/postgres"

	createMu.Lock()
	defer createMu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, adminURL.String())
	if err == nil {
		var exists bool
		if qerr := conn.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)`, dbName).Scan(&exists); qerr == nil && !exists {
			_, _ = conn.Exec(ctx, fmt.Sprintf(`CREATE DATABASE %s`, fmt.Sprintf("%q", dbName)))
		}
		_ = conn.Close(ctx)
	}

	out := *u
	out.Path = "/" + dbName
	return out.String()
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func sanitize(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			out = append(out, r)
		case r >= 'A' && r <= 'Z':
			out = append(out, r+32)
		default:
			out = append(out, '_')
		}
	}
	return string(out)
}

// Package config loads Studio server configuration from environment variables.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/gui-henri/guigas-studio/backend/internal/database"
)

// Config holds the server runtime configuration.
type Config struct {
	Port     string
	DataDir  string
	LogLevel string
	Postgres PostgresConfig
	Auth     AuthConfig
}

// AuthConfig groups the single-account credentials and JWT secret (D-04/T-06).
type AuthConfig struct {
	StudioUsername     string
	StudioPasswordHash string
	JWTSecret          string
}

// PostgresConfig groups the individual POSTGRES_* variables (D-02).
type PostgresConfig struct {
	User         string
	Password     string
	DatabaseName string
	Host         string
	Port         string
	URL          string // optional full URL override
}

// Load reads configuration from the environment with defaults:
// PORT=8080, DATA_DIR=/data, LOG_LEVEL=info. It returns an error when
// LOG_LEVEL is not one of debug, info, warn, error.
func Load() (Config, error) {
	cfg := Config{
		Port:     envOr("PORT", "8080"),
		DataDir:  envOr("DATA_DIR", "/data"),
		LogLevel: strings.ToLower(envOr("LOG_LEVEL", "info")),
		Postgres: PostgresConfig{
			User:         envOr("POSTGRES_USER", ""),
			Password:     envOr("POSTGRES_PASSWORD", ""),
			DatabaseName: envOr("POSTGRES_DB", ""),
			Host:         envOr("POSTGRES_HOST", "localhost"),
			Port:         envOr("POSTGRES_PORT", "5432"),
			URL:          os.Getenv("POSTGRES_DATABASE_URL"),
		},
		Auth: AuthConfig{
			StudioUsername:     os.Getenv("STUDIO_USERNAME"),
			StudioPasswordHash: os.Getenv("STUDIO_PASSWORD_HASH"),
			JWTSecret:          os.Getenv("JWT_SECRET"),
		},
	}

	switch cfg.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return Config{}, fmt.Errorf("invalid LOG_LEVEL %q: must be one of debug, info, warn, error", cfg.LogLevel)
	}
	return cfg, nil
}

// DatabaseURL assembles the postgres connection URL from the configured parts.
func (c Config) DatabaseURL() string {
	return database.BuildDatabaseURL(
		c.Postgres.Host, c.Postgres.Port,
		c.Postgres.User, c.Postgres.Password,
		c.Postgres.DatabaseName, c.Postgres.URL,
	)
}

// SlogLevel maps the configured level name to a slog.Level.
func (c Config) SlogLevel() slog.Level {
	switch c.LogLevel {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

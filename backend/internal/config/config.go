// Package config loads Studio server configuration from environment variables.
package config

import (
	"fmt"
	"log/slog"
	"os"
	"strings"
)

// Config holds the server runtime configuration.
type Config struct {
	Port     string
	DataDir  string
	LogLevel string
}

// Load reads configuration from the environment with defaults:
// PORT=8080, DATA_DIR=/data, LOG_LEVEL=info. It returns an error when
// LOG_LEVEL is not one of debug, info, warn, error.
func Load() (Config, error) {
	cfg := Config{
		Port:     envOr("PORT", "8080"),
		DataDir:  envOr("DATA_DIR", "/data"),
		LogLevel: strings.ToLower(envOr("LOG_LEVEL", "info")),
	}

	switch cfg.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		return Config{}, fmt.Errorf("invalid LOG_LEVEL %q: must be one of debug, info, warn, error", cfg.LogLevel)
	}
	return cfg, nil
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

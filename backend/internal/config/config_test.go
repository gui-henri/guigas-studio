package config

import (
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATA_DIR", "")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("JWT_SECRET", "test-secret")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want %q", cfg.Port, "8080")
	}
	if cfg.DataDir != "/data" {
		t.Errorf("DataDir = %q, want %q", cfg.DataDir, "/data")
	}
	if cfg.LogLevel != "info" {
		t.Errorf("LogLevel = %q, want %q", cfg.LogLevel, "info")
	}
}

func TestLoadOverrides(t *testing.T) {
	t.Setenv("PORT", "9090")
	t.Setenv("DATA_DIR", "/srv/data")
	t.Setenv("LOG_LEVEL", "DEBUG")
	t.Setenv("JWT_SECRET", "test-secret")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.Port != "9090" {
		t.Errorf("Port = %q, want %q", cfg.Port, "9090")
	}
	if cfg.DataDir != "/srv/data" {
		t.Errorf("DataDir = %q, want %q", cfg.DataDir, "/srv/data")
	}
	if cfg.LogLevel != "debug" {
		t.Errorf("LogLevel = %q, want normalized %q", cfg.LogLevel, "debug")
	}
	if got := cfg.SlogLevel(); got.String() != "DEBUG" {
		t.Errorf("SlogLevel() = %v, want DEBUG", got)
	}
}

func TestLoadInvalidLogLevel(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATA_DIR", "")
	t.Setenv("LOG_LEVEL", "verbose")
	t.Setenv("JWT_SECRET", "test-secret")

	if _, err := Load(); err == nil {
		t.Fatal("expected error for invalid LOG_LEVEL, got nil")
	}
}

func TestLoadEmptyJWTSecret(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("DATA_DIR", "")
	t.Setenv("LOG_LEVEL", "")
	t.Setenv("JWT_SECRET", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected error for empty JWT_SECRET, got nil")
	}
}

package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"connectrpc.com/connect"

	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	"github.com/gui-henri/guigas-studio/backend/internal/artifacts"
	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	"github.com/gui-henri/guigas-studio/backend/internal/config"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	"github.com/gui-henri/guigas-studio/backend/internal/events"
	"github.com/gui-henri/guigas-studio/backend/internal/middleware"
	"github.com/gui-henri/guigas-studio/backend/internal/services"
	recording "github.com/gui-henri/guigas-studio/backend/internal/services/recording"
	"github.com/gui-henri/guigas-studio/backend/internal/upload"
	"github.com/gui-henri/guigas-studio/backend/internal/watcher"
)

func newHandler(cfg config.Config, db *database.DB, appHub *events.Hub) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	interceptors := []connect.Interceptor{
		middleware.NewAuthInterceptor(func(raw string) (*auth.Claims, error) {
			return auth.ParseToken(cfg.Auth.JWTSecret, raw)
		}, cfg.Auth.RunnerToken),
	}
	if cfg.Auth.RunnerToken == "" {
		slog.Warn("runner PAT disabled: RUNNER_TOKEN is empty")
	}

	hub := appHub
	if hub == nil {
		hub = events.NewHub() // tests / standalone usage
	}

	concatSvc := recording.NewService(db.Queries, cfg.DataDir, hub)
	runConcat := func(ctx context.Context, videoSlug string) {
		go concatSvc.Run(ctx, videoSlug) // response never waits on concat
	}
	takeUpload := upload.NewHandler(db.Queries, db.Pool, cfg.DataDir, func(raw string) (*auth.Claims, error) {
		return auth.ParseToken(cfg.Auth.JWTSecret, raw)
	})
	takeUpload.SetAfterUpsert(func(videoSlug string) { runConcat(context.Background(), videoSlug) })
	mux.Handle("POST /api/v1/videos/{videoSlug}/takes", takeUpload)
	mux.Handle("GET /api/v1/videos/{videoSlug}/takes", takeUpload)
	mux.Handle("GET /api/events", events.HTTPHandler(hub, func(raw string) (*auth.Claims, error) {
		return auth.ParseToken(cfg.Auth.JWTSecret, raw)
	}))
	mux.Handle(studiov1connect.NewHealthServiceHandler(services.NewHealthService(), connect.WithInterceptors(interceptors...)))
	mux.Handle(studiov1connect.NewAuthServiceHandler(services.NewAuthService(db.Pool, cfg.Auth.JWTSecret), connect.WithInterceptors(interceptors...)))
	mux.Handle(studiov1connect.NewVideoServiceHandler(services.NewVideoService(db.Queries, cfg.DataDir, hub), connect.WithInterceptors(interceptors...)))

	return h2c.NewHandler(mux, &http2.Server{})
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})).
			Error("invalid configuration", "error", err)
		os.Exit(1)
	}

	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: cfg.SlogLevel()}))
	slog.SetDefault(logger)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := database.Connect(ctx, cfg.DatabaseURL())
	if err != nil {
		logger.Error("database unavailable", "error", err)
		os.Exit(1)
	}
	defer db.Pool.Close()
	logger.Info("database connected")

	created, err := services.SeedSingleAccount(ctx, db.Pool, cfg.Auth.StudioUsername, cfg.Auth.StudioPasswordHash)
	if err != nil {
		logger.Error("account seed failed", "error", err)
		os.Exit(1)
	}
	if created {
		logger.Info("auth.seeded", "username", cfg.Auth.StudioUsername)
	}

	interval := 30 * time.Minute
	if raw := os.Getenv("RSS_POLL_INTERVAL"); raw != "" {
		if parsed, perr := time.ParseDuration(raw); perr == nil && parsed > 0 {
			interval = parsed
		} else if perr != nil {
			logger.Warn("invalid RSS_POLL_INTERVAL, using default", slog.String("value", raw))
		}
	}

	appHub := events.NewHub()

	rssWatcher := watcher.New(db.Queries, watcher.Config{
		URL:      os.Getenv("RSS_URL"),
		Interval: interval,
		DataDir:  cfg.DataDir,
	}, logger)
	go rssWatcher.Run(ctx)

	scriptObserver := artifacts.NewObserver(
		filepath.Join(cfg.DataDir, "videos"),
		db.Queries,
		artifacts.HubPublisher{Hub: appHub},
		logger,
	)
	go func() {
		if err := scriptObserver.Run(ctx); err != nil {
			logger.Error("artifacts.observer_failed", slog.Any("error", err))
		}
	}()

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: newHandler(cfg, db, appHub),
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("server listening", "addr", server.Addr, "data_dir", cfg.DataDir)
		errCh <- server.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("server failed", "error", err)
			os.Exit(1)
		}
	case <-ctx.Done():
		logger.Info("shutdown signal received")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Error("graceful shutdown failed", "error", err)
			os.Exit(1)
		}
		logger.Info("server stopped cleanly")
	}
}

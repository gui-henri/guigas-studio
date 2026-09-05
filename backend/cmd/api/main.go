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
	"strings"
	"syscall"
	"time"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	"connectrpc.com/connect"

	"github.com/google/uuid"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	"github.com/gui-henri/guigas-studio/backend/internal/artifacts"
	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	"github.com/gui-henri/guigas-studio/backend/internal/config"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	"github.com/gui-henri/guigas-studio/backend/internal/events"
	"github.com/gui-henri/guigas-studio/backend/internal/gemini"
	"github.com/gui-henri/guigas-studio/backend/internal/middleware"
	"github.com/gui-henri/guigas-studio/backend/internal/scriptgen"
	"github.com/gui-henri/guigas-studio/backend/internal/services"
	recording "github.com/gui-henri/guigas-studio/backend/internal/services/recording"
	"github.com/gui-henri/guigas-studio/backend/internal/storage"
	"github.com/gui-henri/guigas-studio/backend/internal/timeline"
	"github.com/gui-henri/guigas-studio/backend/internal/upload"
	"github.com/gui-henri/guigas-studio/backend/internal/watcher"
)

func newHandler(cfg config.Config, db *database.DB, appHub *events.Hub, watchers ...*watcher.Watcher) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		body := map[string]string{"status": "ok", "version": "v1.1-rss-sync"}
		code := http.StatusOK
		if db == nil || db.Pool == nil {
			body["status"] = "degraded"
			body["postgres"] = "unconfigured"
			code = http.StatusServiceUnavailable
		} else {
			pingCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			if err := db.Pool.Ping(pingCtx); err != nil {
				slog.Warn("healthz.postgres_unreachable", slog.Any("error", err))
				body["status"] = "degraded"
				body["postgres"] = "error"
				code = http.StatusServiceUnavailable
			} else {
				body["postgres"] = "ok"
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(body)
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
	timelineSvc := timeline.NewService(db.Queries, cfg.DataDir, hub)
	takeUpload := upload.NewHandler(db.Queries, db.Pool, cfg.DataDir, func(raw string) (*auth.Claims, error) {
		return auth.ParseToken(cfg.Auth.JWTSecret, raw)
	})
	artifactDownload := artifacts.NewDownloadHandler(db.Queries, cfg.DataDir, func(raw string) (*auth.Claims, error) {
		return auth.ParseToken(cfg.Auth.JWTSecret, raw)
	})
	mux.Handle("GET /api/v1/videos/{videoID}/artifacts/{path...}", artifactDownload)
	filesHandler := artifacts.NewFilesHandler(filepath.Join(cfg.DataDir, "videos"), cfg.Auth.JWTSecret)
	mux.Handle("GET /api/v1/videos/{videoSlug}/files/{path...}", filesHandler)
	rendersUpload := artifacts.NewRendersUploadHandler(cfg.DataDir, cfg.Auth.JWTSecret, cfg.Auth.RunnerToken)
	mux.Handle("PUT /api/v1/videos/{videoSlug}/renders/{file}/chunks", rendersUpload)
	mux.Handle("POST /api/v1/videos/{slug}/renders/{file}/finalize", rendersUpload)

	takeUpload.SetAfterUpsert(func(videoSlug string) {
		go func() {
			bgCtx := context.WithoutCancel(context.Background())
			concatSvc.Run(bgCtx, videoSlug)
			timelineSvc.Run(bgCtx, videoSlug) // no-op unless voice_processing
		}()
	})
	mux.Handle("POST /api/v1/videos/{videoSlug}/takes", takeUpload)
	mux.Handle("GET /api/v1/videos/{videoSlug}/takes", takeUpload)
	mux.Handle("DELETE /api/v1/videos/{videoSlug}/takes", takeUpload)
	mux.Handle("GET /api/events", events.HTTPHandler(hub, func(raw string) (*auth.Claims, error) {
		return auth.ParseToken(cfg.Auth.JWTSecret, raw)
	}))
	mux.Handle(studiov1connect.NewHealthServiceHandler(services.NewHealthService(), connect.WithInterceptors(interceptors...)))
	mux.Handle(studiov1connect.NewAuthServiceHandler(services.NewAuthService(db.Pool, cfg.Auth.JWTSecret), connect.WithInterceptors(interceptors...)))
	videoSvc := services.NewVideoService(db.Queries, cfg.DataDir, hub, db.Pool)
	if gc, gerr := gemini.NewFromEnvScript(); gerr == nil {
		videoSvc.WithScriptGenerator(gc)
	}
	if len(watchers) > 0 && watchers[0] != nil {
		videoSvc.SetWatcher(watchers[0])
	}
	mux.Handle(studiov1connect.NewVideoServiceHandler(videoSvc, connect.WithInterceptors(interceptors...)))
	mux.Handle(studiov1connect.NewJobServiceHandler(services.NewJobService(db.Queries, db.Pool, cfg.DataDir, hub), connect.WithInterceptors(interceptors...)))

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		if _, err := os.Stat("frontend/dist"); err == nil {
			staticDir = "frontend/dist"
		}
	}
	if staticDir != "" {
		if _, err := os.Stat(staticDir); err == nil {
			mux.Handle("/", spaHandler(staticDir))
		}
	}

	return h2c.NewHandler(mux, &http2.Server{})
}

func spaHandler(staticDir string) http.Handler {
	fs := http.Dir(staticDir)
	fileServer := http.FileServer(fs)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := filepath.Clean(filepath.ToSlash(r.URL.Path))
		if cleanPath == "/" || cleanPath == "" || cleanPath == "." {
			w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
			http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
			return
		}

		f, err := fs.Open(cleanPath)
		if err == nil {
			defer f.Close()
			stat, err := f.Stat()
			if err == nil && !stat.IsDir() {
				if strings.HasPrefix(cleanPath, "/assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
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

	store, err := storage.NewFromConfig(ctx, cfg)
	if err != nil {
		logger.Error("storage misconfigured", "error", err)
		os.Exit(1)
	}
	if cfg.S3.Enabled {
		logger.Info("storage.mode", slog.String("backend", "s3"), slog.String("bucket", cfg.S3.Bucket), slog.String("endpoint", cfg.S3.Endpoint))
	} else {
		logger.Info("storage.mode", slog.String("backend", "local"), slog.String("dir", cfg.DataDir))
	}
	_ = store // handler migration to presigned Storage lands next; disk stays source of truth meanwhile

	// Automatic script generation (Gemini, structured JSON). Disabled when
	// GEMINI_API_KEY is empty — the manual flow (context pack + UI) stays.
	geminiClient, gerr := gemini.NewFromEnvScript()
	if gerr != nil {
		logger.Warn("scriptgen.disabled", slog.String("reason", "GEMINI_API_KEY is empty"))
		geminiClient = nil
	}
	var onScaffolded func(ctx context.Context, videoID uuid.UUID, slug, title string)
	if geminiClient != nil {
		gc := geminiClient
		dataDir := cfg.DataDir
		onScaffolded = func(hookCtx context.Context, _ uuid.UUID, slug, title string) {
			if hookCtx.Err() != nil {
				return
			}
			schema := gemini.ScriptResponseSchema()
			if err := scriptgen.GenerateForSlug(hookCtx, gc, scriptgen.ValidateFunc(), dataDir, slug, title, schema, scriptgen.MaxAttemptsFromEnv(3)); err != nil {
				logger.Error("scriptgen.failed", slog.String("slug", slug), slog.Any("error", err))
			}
		}
	}

	rssWatcher := watcher.New(db.Queries, watcher.Config{
		URL:          os.Getenv("RSS_URL"),
		Interval:     interval,
		DataDir:      cfg.DataDir,
		OnScaffolded: onScaffolded,
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
		Handler: newHandler(cfg, db, appHub, rssWatcher),
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

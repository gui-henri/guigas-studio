// Package watcher implements the RSS poller that births videos into the pipeline.
package watcher

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/workspace"
)

// Config controls the RSS polling loop and workspace scaffolding.
type Config struct {
	URL      string        // RSS_URL
	Interval time.Duration // RSS_POLL_INTERVAL (default 30m)
	DataDir  string        // DATA_DIR — workspace root (/data/videos/<slug>)
	// OnScaffolded fires (async, detached ctx) after a video reaches
	// script_pending. Used by automatic script generation; nil disables.
	OnScaffolded func(ctx context.Context, videoID uuid.UUID, slug, title string)
}

// Watcher polls the blog feed and creates `new` videos for unseen posts.
type Watcher struct {
	queries *sqlc.Queries
	cfg     Config
	logger  *slog.Logger
	client  *http.Client
}

// New builds a Watcher; interval <= 0 falls back to 30m.
func New(queries *sqlc.Queries, cfg Config, logger *slog.Logger) *Watcher {
	if cfg.Interval <= 0 {
		cfg.Interval = 30 * time.Minute
	}
	return &Watcher{
		queries: queries,
		cfg:     cfg,
		logger:  logger,
		client:  &http.Client{Timeout: 15 * time.Second},
	}
}

// rss XML shapes (only what we need).

type rssFeed struct {
	XMLName xml.Name `xml:"rss"`
	Channel struct {
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}

type rssItem struct {
	GUID string `xml:"guid"`
	Text string `xml:"title"`
	Link string `xml:"link"`
}

// Poll fetches, parses and processes the feed once. Exported for tests.
func (w *Watcher) Poll(ctx context.Context) ([]sqlc.Video, error) {
	if w.cfg.URL == "" {
		return nil, errors.New("RSS_URL is empty")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, w.cfg.URL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	resp, err := w.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch feed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch feed: status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, fmt.Errorf("read feed: %w", err)
	}

	var feed rssFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil, fmt.Errorf("parse feed: %w", err)
	}
	return w.processItems(ctx, feed.Channel.Items), nil
}

func (w *Watcher) processItems(ctx context.Context, items []rssItem) []sqlc.Video {
	var createdVideos []sqlc.Video

	// Baseline: while rss_items is still empty, the first successful poll marks
	// everything as seen WITHOUT creating videos — avoids flooding from backlog.
	baseline, err := w.queries.CountRssItems(ctx)
	if err != nil {
		w.logger.Error("watcher.rss.count_failed", slog.Any("error", err))
		return nil
	}
	isBaseline := baseline == 0

	for _, item := range items {
		guid := strings.TrimSpace(item.GUID)
		if guid == "" {
			// GUID is the dedup key; an item without one cannot be tracked.
			w.logger.Warn("watcher.rss.item_without_guid", slog.String("title", item.Text))
			continue
		}

		rows, err := w.queries.InsertRssItem(ctx, sqlc.InsertRssItemParams{
			Guid: guid,
		})
		if err != nil {
			w.logger.Error("watcher.rss.insert_failed",
				slog.String("guid", guid), slog.Any("error", err))
			continue
		}
		if rows == 0 {
			continue // already seen
		}

		title := strings.TrimSpace(item.Text)
		link := strings.TrimSpace(item.Link)

		if isBaseline {
			w.logger.Info("watcher.rss.baseline_marked", slog.String("guid", guid))
			continue
		}

		slug := Slugify(link, title)
		video, err := w.queries.CreateVideo(ctx, sqlc.CreateVideoParams{
			Slug:      slug,
			Title:     title,
			SourceUrl: link,
		})
		if err != nil {
			w.logger.Error("watcher.rss.create_video_failed",
				slog.String("guid", guid), slog.String("slug", slug), slog.Any("error", err))
			continue
		}
		createdVideos = append(createdVideos, video)
		nullID := pgtype.UUID{Bytes: video.ID, Valid: true}
		if err := w.queries.SetRssItemVideo(ctx, sqlc.SetRssItemVideoParams{
			Guid:    guid,
			VideoID: nullID,
		}); err != nil {
			w.logger.Error("watcher.rss.link_video_failed",
				slog.String("guid", guid), slog.Any("error", err))
		}
		w.logger.Info("watcher.rss.new_item",
			slog.String("guid", guid),
			slog.String("slug", slug),
			slog.String("title", title),
		)

		w.scaffoldWorkspace(ctx, video.ID, slug, title, link)
	}
	return createdVideos
}

// scaffoldWorkspace materializes the context pack and moves the video to
// script_pending. On failure the video stays in `new` (natural retry next poll).
func (w *Watcher) scaffoldWorkspace(ctx context.Context, videoID uuid.UUID, slug, title, link string) {
	if w.cfg.DataDir == "" {
		return // scaffolding disabled (e.g. unit tests)
	}
	postMD := fmt.Sprintf("# %s\n\nFonte: %s\n", title, link)
	root, err := workspace.Scaffold(w.cfg.DataDir, slug, []byte(postMD))
	if err != nil {
		w.logger.Error("watcher.workspace.scaffold_failed",
			slog.String("slug", slug), slog.Any("error", err))
		return
	}
	if err := videostate.Transition(videostate.StateNew, videostate.StateScriptPending); err != nil {
		w.logger.Error("watcher.workspace.transition_rejected",
			slog.String("slug", slug), slog.Any("error", err))
		return
	}
	if err := w.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID:     videoID,
		Status: string(videostate.StateScriptPending),
	}); err != nil {
		w.logger.Error("watcher.workspace.status_update_failed",
			slog.String("slug", slug), slog.Any("error", err))
		return
	}
	if err := w.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: videoID,
		Status:  string(videostate.StateScriptPending),
		Reason:  "context pack scaffolded from RSS post",
		Actor:   "watcher",
	}); err != nil {
		w.logger.Warn("watcher.workspace.history_insert_failed",
			slog.String("slug", slug), slog.Any("error", err))
	}
	if err := workspace.Commit(root, fmt.Sprintf("chore(%s): scaffold context pack", slug)); err != nil {
		w.logger.Error("watcher.workspace.commit_failed",
			slog.String("slug", slug), slog.Any("error", err))
		return
	}
	w.logger.Info("watcher.workspace.ready",
		slog.String("slug", slug),
		slog.String("status", string(videostate.StateScriptPending)),
	)
	if w.cfg.OnScaffolded != nil {
		hook := w.cfg.OnScaffolded
		go hook(context.WithoutCancel(ctx), videoID, slug, title)
	}
}

// Run loops until ctx is cancelled; a bad feed never kills the watcher.
func (w *Watcher) Run(ctx context.Context) {
	if w.cfg.URL == "" {
		w.logger.Warn("watcher.rss.disabled", slog.String("reason", "RSS_URL is empty"))
		return
	}
	ticker := time.NewTicker(w.cfg.Interval)
	defer ticker.Stop()

	w.logger.Info("watcher.rss.started",
		slog.String("url", w.cfg.URL), slog.Duration("interval", w.cfg.Interval))

	w.pollLogged(ctx)
	for {
		select {
		case <-ctx.Done():
			w.logger.Info("watcher.rss.stopped")
			return
		case <-ticker.C:
			w.pollLogged(ctx)
		}
	}
}

func (w *Watcher) pollLogged(ctx context.Context) {
	pollCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if _, err := w.Poll(pollCtx); err != nil && ctx.Err() == nil {
		w.logger.Error("watcher.rss.poll_failed", slog.Any("error", err))
	}
}

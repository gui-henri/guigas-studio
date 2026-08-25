package artifacts

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
)

// debounceDelay coalesces editor write bursts / atomic tmp+rename saves.
const debounceDelay = 500 * time.Millisecond

// ScriptFileName is the only artifact the observer watches.
const ScriptFileName = "script.json"

// Observer watches workspaces for script.json writes, validates them and moves
// videos through the state machine (T-08).
type Observer struct {
	root      string // <DATA_DIR>/videos
	queries   *sqlc.Queries
	publisher Publisher
	logger    *slog.Logger
}

func NewObserver(root string, queries *sqlc.Queries, publisher Publisher, logger *slog.Logger) *Observer {
	if publisher == nil {
		publisher = NoopPublisher{}
	}
	return &Observer{
		root:      root,
		queries:   queries,
		publisher: publisher,
		logger:    logger,
	}
}

// Run blocks until ctx is cancelled: watches root recursively and processes
// debounced script.json events.
func (o *Observer) Run(ctx context.Context) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("create watcher: %w", err)
	}
	defer watcher.Close()

	if err := o.watchAll(watcher, o.root); err != nil {
		o.logger.Warn("artifacts.observer.initial_watch_failed", slog.Any("error", err))
	}

	debounced := make(chan string, 64)
	d := newDebouncer(debounceDelay, func(path string) { debounced <- path })

	for {
		select {
		case <-ctx.Done():
			return nil

		case ev, ok := <-watcher.Events:
			if !ok {
				return nil
			}
			if ev.Has(fsnotify.Create) {
				if fi, statErr := os.Stat(ev.Name); statErr == nil && fi.IsDir() {
					// fsnotify is not recursive: watch new dirs as they appear.
					if wErr := o.watchAll(watcher, ev.Name); wErr != nil {
						o.logger.Warn("artifacts.observer.subdir_watch_failed",
							slog.String("dir", ev.Name), slog.Any("error", wErr))
					}
					continue
				}
			}
			if filepath.Base(ev.Name) != ScriptFileName {
				continue
			}
			d.trigger(ev.Name)

		case path := <-debounced:
			select {
			case <-ctx.Done():
				return nil
			default:
			}
			o.ProcessScriptPath(ctx, path)

		case err, ok := <-watcher.Errors:
			if !ok {
				return nil
			}
			o.logger.Error("artifacts.observer.watcher_error", slog.Any("error", err))
		}
	}
}

// debouncer coalesces bursts of events per path into a single delayed firing.
type debouncer struct {
	delay  time.Duration
	timers map[string]*time.Timer
	fire   func(path string)
}

func newDebouncer(delay time.Duration, fire func(path string)) *debouncer {
	return &debouncer{delay: delay, timers: make(map[string]*time.Timer), fire: fire}
}

func (d *debouncer) trigger(path string) {
	if t, exists := d.timers[path]; exists {
		t.Reset(d.delay)
		return
	}
	d.timers[path] = time.AfterFunc(d.delay, func() {
		delete(d.timers, path)
		d.fire(path)
	})
}

// watchAll adds dir and every existing subdirectory to the watcher.
func (o *Observer) watchAll(watcher *fsnotify.Watcher, dir string) error {
	// The workspace root may not exist yet (first video creates it); ensure it
	// does so initial watching succeeds and future subdirs are picked up via Create.
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create watch root %s: %w", dir, err)
	}
	return filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			if os.IsNotExist(err) {
				return nil // raced with deletion
			}
			return err
		}
		if d.IsDir() {
			if addErr := watcher.Add(path); addErr != nil {
				o.logger.Warn("artifacts.observer.add_failed",
					slog.String("dir", path), slog.Any("error", addErr))
			}
		}
		return nil
	})
}

// ProcessScriptPath validates <slug>/script.json and applies the state machine.
// Exported for tests; Run calls it after debouncing.
func (o *Observer) ProcessScriptPath(ctx context.Context, scriptPath string) {
	slug := filepath.Base(filepath.Dir(scriptPath))

	data, err := os.ReadFile(scriptPath)
	if err != nil {
		if os.IsNotExist(err) {
			return // transient delete/rename; nothing to do
		}
		o.logger.Error("artifacts.read_failed",
			slog.String("path", scriptPath), slog.Any("error", err))
		return
	}

	_, vErrors := ValidateScript(data)
	video, dbErr := o.queries.GetVideoBySlug(ctx, slug)
	if dbErr != nil {
		o.logger.Warn("artifacts.video_not_found",
			slog.String("slug", slug), slog.Any("error", dbErr))
		return
	}
	videoID := video.ID.String()

	valid := len(vErrors) == 0
	parseErrorsJSON := marshalParseErrors(vErrors)
	if _, err := o.queries.InsertArtifactParse(ctx, sqlc.InsertArtifactParseParams{
		VideoID:  video.ID,
		Artifact: ScriptFileName,
		Valid:    valid,
		Errors:   parseErrorsJSON,
	}); err != nil {
		o.logger.Error("artifacts.parse_record_failed",
			slog.String("video_id", videoID), slog.Any("error", err))
	}

	if !valid {
		o.logger.Error("artifacts.script_invalid",
			slog.String("video_id", videoID),
			slog.String("slug", slug),
			slog.Any("errors", vErrors),
		)
		return // status stays script_pending
	}

	from := videostate.State(video.Status)
	to := videostate.StateScriptReview
	if err := videostate.Transition(from, to); err != nil {
		// Rewrite of an already-reviewed/approved script (S1-04): legal, just no-op.
		o.logger.Debug("artifacts.transition_skipped",
			slog.String("video_id", videoID),
			slog.String("from", string(from)),
			slog.Any("reason", err),
		)
		return
	}
	if err := o.queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID:     video.ID,
		Status: string(to),
	}); err != nil {
		o.logger.Error("artifacts.status_update_failed",
			slog.String("video_id", videoID), slog.Any("error", err))
		return
	}
	if err := o.queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
		VideoID: video.ID,
		Status:  string(to),
		Reason:  fmt.Sprintf("script.json validated (%s)", slug),
		Actor:   "opencode",
	}); err != nil {
		o.logger.Warn("artifacts.history_insert_failed",
			slog.String("video_id", videoID), slog.Any("error", err))
	}

	// Freeze the first validated version as the review diff base (S1-04).
	if rows, err := o.queries.SetOriginalScript(ctx, sqlc.SetOriginalScriptParams{
		ID:             video.ID,
		OriginalScript: data,
	}); err != nil {
		o.logger.Warn("artifacts.original_script_failed",
			slog.String("video_id", videoID), slog.Any("error", err))
	} else if rows == 1 {
		o.logger.Debug("artifacts.original_script_frozen", slog.String("video_id", videoID))
	}

	o.logger.Info("artifacts.script_validated",
		slog.String("video_id", videoID),
		slog.String("slug", slug),
		slog.String("transition", fmt.Sprintf("%s->%s", from, to)),
	)
	o.publisher.PublishScriptValidated(videoID, slug)
}

// marshalParseErrors renders validation errors as a JSONB-friendly value.
func marshalParseErrors(errs []error) []byte {
	if len(errs) == 0 {
		return nil
	}
	msgs := make([]string, 0, len(errs))
	for _, e := range errs {
		msgs = append(msgs, e.Error())
	}
	b, err := json.Marshal(msgs)
	if err != nil {
		return []byte(`["failed to marshal errors"]`)
	}
	return b
}

//go:build integration

// Scenes flow (S4-07): a video in scenes_pending whose script.json gains
// scenes — valid grammar → scenes_review + SSE event; invalid grammar → no
// transition + .validation-latest.json with the exact broken prop path.
//
// Run with:
//
//	TEST_DATABASE_URL="postgres://studio:studio@localhost:5432/studio_test?sslmode=disable" \
//	  go test -tags=integration -v ./internal/integration/ -run Scenes
package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"

	"github.com/gui-henri/guigas-studio/backend/internal/artifacts"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

type scenesRecordingPublisher struct {
	events []string
}

func (p *scenesRecordingPublisher) PublishScriptValidated(videoID, slug string) {}
func (p *scenesRecordingPublisher) PublishScenesValidated(videoID, slug string, valid bool) {
	p.events = append(p.events, fmt.Sprintf("%s|%v", slug, valid))
}

func mustUUID(t *testing.T) uuid.UUID {
	t.Helper()
	id, err := uuid.NewRandom()
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func scenesScript(sceneJSON *string) []byte {
	seg := `{
      "id": "hook",
      "beat": "BEAT_HOOK",
      "emotion": "EMOTION_SURPRISED",
      "narration_pt": "Gancho.",
      "scene": %s
    }`
	scene := "null"
	if sceneJSON != nil {
		scene = *sceneJSON
	}
	return []byte(fmt.Sprintf(`{
  "post": "scenes-flow",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 8 },
  "segments": [%s]
}`, fmt.Sprintf(seg, scene)))
}

func setupScenesVideo(t *testing.T, ctx context.Context, q *sqlc.Queries, slug string) sqlc.Video {
	t.Helper()
	vid, err := q.CreateVideo(ctx, sqlc.CreateVideoParams{
		Slug:      slug,
		Title:     "Scenes Flow",
		SourceUrl: "https://example.com/" + slug,
	})
	if err != nil {
		t.Fatalf("insert video: %v", err)
	}
	for _, st := range []string{"script_pending", "script_review", "script_approved", "recording", "voice_processing", "scenes_pending"} {
		if err := q.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{ID: vid.ID, Status: st}); err != nil {
			t.Fatalf("walk to %s: %v", st, err)
		}
	}
	row, err := q.GetVideoBySlug(ctx, slug)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if row.Status != "scenes_pending" {
		t.Fatalf("setup: status=%s", row.Status)
	}
	return row
}

func TestScenesFlow(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = os.Getenv("STUDIO_TEST_DATABASE_URL")
	}
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}

	db, err := database.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	if _, execErr := db.Pool.Exec(ctx,
		`TRUNCATE video_artifact_parses, video_status_history, rss_items, videos CASCADE`); execErr != nil {
		t.Fatalf("truncate: %v", execErr)
	}
	queries := db.Queries

	dataDir := t.TempDir()
	pub := &scenesRecordingPublisher{}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	obs := artifacts.NewObserver(filepath.Join(dataDir, "videos"), queries, pub, logger)

	validScene := `{"type":"code_typing","props":{"code":"let x = 1;"}}`
	brokenScene := `{"type":"big_number","props":{"value":"10x"}}`

	cases := []struct {
		name       string
		slug       string
		scene      *string
		wantStatus string
		wantValid  bool
	}{
		{"valid scene transitions", "scenes-ok", &validScene, "scenes_review", true},
		{"invalid scene stays", "scenes-bad", &brokenScene, "scenes_pending", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			video := setupScenesVideo(t, ctx, queries, tc.slug)
			ws := filepath.Join(dataDir, "videos", tc.slug)
			if err := os.MkdirAll(ws, 0o755); err != nil {
				t.Fatal(err)
			}
			scriptPath := filepath.Join(ws, "script.json")
			if err := os.WriteFile(scriptPath, scenesScript(tc.scene), 0o644); err != nil {
				t.Fatal(err)
			}

			obs.ProcessScriptPath(ctx, scriptPath)

			row, err := queries.GetVideoBySlug(ctx, tc.slug)
			if err != nil {
				t.Fatal(err)
			}
			if row.Status != tc.wantStatus {
				t.Fatalf("status = %s, want %s", row.Status, tc.wantStatus)
			}

			found := false
			for _, e := range pub.events {
				if e == tc.slug+"|"+fmt.Sprint(tc.wantValid) {
					found = true
				}
			}
			if !found {
				t.Fatalf("missing SSE event for %s; got %v", tc.slug, pub.events)
			}

			reportBytes, err := os.ReadFile(filepath.Join(ws, ".validation-latest.json"))
			if err != nil {
				t.Fatalf(".validation-latest.json: %v", err)
			}
			var report struct {
				Valid  bool `json:"valid"`
				Issues []struct {
					SegmentID string `json:"segment_id"`
					Path      string `json:"path"`
					Message   string `json:"message"`
				} `json:"issues"`
			}
			if err := json.Unmarshal(reportBytes, &report); err != nil {
				t.Fatal(err)
			}

			switch tc.wantStatus {
			case "scenes_review":
				if !report.Valid || len(report.Issues) != 0 {
					t.Fatalf("expected clean report, got %s", reportBytes)
				}
				if err := queries.InsertStatusChange(ctx, sqlc.InsertStatusChangeParams{
					VideoID: video.ID,
					Status:  "scenes_review",
					Reason:  "test assert",
					Actor:   "test",
				}); err != nil {
					t.Fatalf("history row missing for transition: %v", err)
				}
			case "scenes_pending":
				if report.Valid {
					t.Fatalf("expected invalid report, got %s", reportBytes)
				}
				hit := false
				for _, i := range report.Issues {
					if i.SegmentID == "hook" && i.Path == "props.label" && i.Message == "required" {
						hit = true
					}
				}
				if !hit {
					t.Fatalf("report lacks exact broken prop (props.label required): %s", reportBytes)
				}
			}
		})
	}
}

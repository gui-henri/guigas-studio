package artifacts

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gui-henri/guigas-studio/backend/internal/testutil"

	"github.com/gui-henri/guigas-studio/backend/internal/database"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

// shared integration helpers for artifacts tests.

func connectTestDB(t *testing.T) (*database.DB, error) {
	t.Helper()
	url := testutil.DatabaseURL(t, "artifacts")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set; skipping integration test")
	}
	return database.Connect(context.Background(), url)
}

func truncatePipeline(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	if _, err := pool.Exec(ctx, `TRUNCATE video_artifact_parses, rss_items, videos, users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
}

func newDemoVideoParams(slug string) sqlc.CreateVideoParams {
	return sqlc.CreateVideoParams{
		Slug:      slug,
		Title:     "Demo Post",
		SourceUrl: "https://blog.example.com/" + slug,
	}
}

func assertParse(t *testing.T, ctx context.Context, db *database.DB, videoID uuid.UUID, wantValid bool) {
	t.Helper()
	parses, err := db.Queries.ListParsesByVideo(ctx, videoID)
	if err != nil {
		t.Fatalf("list parses: %v", err)
	}
	if len(parses) == 0 {
		t.Fatal("no parse recorded")
	}
	latest := parses[0] // ordered by created_at DESC
	if latest.Valid != wantValid {
		t.Errorf("latest parse valid = %v, want %v (errors: %s)", latest.Valid, wantValid, latest.Errors)
	}
}

func assertStatus(t *testing.T, ctx context.Context, db *database.DB, videoID uuid.UUID, want string) {
	t.Helper()
	video, err := db.Queries.GetVideo(ctx, videoID)
	if err != nil {
		t.Fatalf("get video: %v", err)
	}
	if video.Status != want {
		t.Errorf("status = %q, want %q", video.Status, want)
	}
}

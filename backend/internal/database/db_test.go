package database

import (
	"context"
	"testing"

	"github.com/google/uuid"

	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/testutil"
)

// testDBURL comes from STUDIO_TEST_DATABASE_URL; without it integration tests skip.
func testDBURL(t *testing.T) string {
	t.Helper()
	return testutil.DatabaseURL(t, "database")
}

func TestConnectMigrateAndQueriesRoundtrip(t *testing.T) {
	ctx := context.Background()
	db, err := Connect(ctx, testDBURL(t))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()

	if _, err := db.Pool.Exec(ctx, `TRUNCATE video_artifact_parses, rss_items, videos, users CASCADE`); err != nil {
		t.Fatalf("clean tables: %v", err)
	}

	created, err := db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{
		Slug:      "2026-08-25-test-post",
		Title:     "Test Post",
		SourceUrl: "https://example.com/test-post",
	})
	if err != nil {
		t.Fatalf("create video: %v", err)
	}
	if created.Status != "new" {
		t.Errorf("status = %q, want default %q", created.Status, "new")
	}
	if created.ID == uuid.Nil {
		t.Error("expected generated uuid id")
	}

	got, err := db.Queries.GetVideo(ctx, created.ID)
	if err != nil {
		t.Fatalf("get video: %v", err)
	}
	if got.Slug != created.Slug || got.Title != created.Title {
		t.Errorf("roundtrip mismatch: got %+v want %+v", got, created)
	}

	listed, err := db.Queries.ListVideos(ctx)
	if err != nil {
		t.Fatalf("list videos: %v", err)
	}
	if len(listed) != 1 || listed[0].ID != created.ID {
		t.Errorf("list = %+v, want single video %s", listed, created.ID)
	}
}

func TestMigrateIsIdempotent(t *testing.T) {
	ctx := context.Background()
	db, err := Connect(ctx, testDBURL(t))
	if err != nil {
		t.Fatalf("connect (1st): %v", err)
	}
	defer db.Pool.Close()

	var firstCount int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&firstCount); err != nil {
		t.Fatalf("count migrations: %v", err)
	}

	if err := Migrate(ctx, db.Pool); err != nil {
		t.Fatalf("migrate again: %v", err)
	}

	var secondCount int
	if err := db.Pool.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&secondCount); err != nil {
		t.Fatalf("count migrations after re-run: %v", err)
	}
	if firstCount != secondCount {
		t.Errorf("migration rows changed on re-run: %d -> %d", firstCount, secondCount)
	}
}

func TestUserQueriesRoundtrip(t *testing.T) {
	ctx := context.Background()
	db, err := Connect(ctx, testDBURL(t))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()

	if _, err := db.Pool.Exec(ctx, `TRUNCATE users`); err != nil {
		t.Fatalf("clean users: %v", err)
	}

	rows, err := db.Queries.CreateUserIfNotExists(ctx, sqlc.CreateUserIfNotExistsParams{
		Username:     "gui",
		PasswordHash: "$argon2id$test",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if rows != 1 {
		t.Errorf("first insert affected %d rows, want 1", rows)
	}

	rows, err = db.Queries.CreateUserIfNotExists(ctx, sqlc.CreateUserIfNotExistsParams{
		Username:     "gui",
		PasswordHash: "$argon2id$other",
	})
	if err != nil {
		t.Fatalf("re-create user: %v", err)
	}
	if rows != 0 {
		t.Errorf("conflicting insert affected %d rows, want 0", rows)
	}

	user, err := db.Queries.GetUserByUsername(ctx, "gui")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if user.PasswordHash != "$argon2id$test" {
		t.Errorf("password_hash = %q, want the original (conflict must not overwrite)", user.PasswordHash)
	}
}

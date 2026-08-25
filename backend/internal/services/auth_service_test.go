package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	"github.com/gui-henri/guigas-studio/backend/internal/testutil"
)

func testDBURL(t *testing.T) string {
	t.Helper()
	url := testutil.DatabaseURL(t, "services")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL not set; skipping integration test")
	}
	return url
}

// newAuthClient seeds the account and returns an in-process Connect client.
func newAuthClient(t *testing.T) (studiov1connect.AuthServiceClient, func()) {
	t.Helper()
	ctx := context.Background()
	db, err := database.Connect(ctx, testDBURL(t))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	hash, err := auth.HashPassword("test-password-123")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if _, err := db.Pool.Exec(ctx, `TRUNCATE users`); err != nil {
		t.Fatalf("clean users: %v", err)
	}
	created, err := SeedSingleAccount(ctx, db.Pool, "tester", hash)
	if err != nil || !created {
		t.Fatalf("seed: created=%v err=%v", created, err)
	}

	mux := new(http.ServeMux)
	mux.Handle(studiov1connect.NewAuthServiceHandler(NewAuthService(db.Pool, "jwt-secret-jwt-secret-jwt-s")))
	srv := httptest.NewServer(mux)
	client := studiov1connect.NewAuthServiceClient(srv.Client(), srv.URL)
	cleanup := func() {
		srv.Close()
		db.Pool.Close()
	}
	return client, cleanup
}

func TestLoginSuccessAndFailure(t *testing.T) {
	client, cleanup := newAuthClient(t)
	defer cleanup()

	resp, err := client.Login(context.Background(), connect.NewRequest(&studiov1.LoginRequest{
		Username: "tester",
		Password: "test-password-123",
	}))
	if err != nil {
		t.Fatalf("login with correct credentials: %v", err)
	}
	if resp.Msg.GetToken() == "" {
		t.Error("expected non-empty token")
	}
	if resp.Msg.GetExpiresAt() == "" {
		t.Error("expected expires_at to be set")
	}
	if len(resp.Msg.GetToken()) < 40 {
		t.Errorf("token suspiciously short: %q", resp.Msg.GetToken())
	}
}

func TestLoginWrongPassword(t *testing.T) {
	client, cleanup := newAuthClient(t)
	defer cleanup()

	_, err := client.Login(context.Background(), connect.NewRequest(&studiov1.LoginRequest{
		Username: "tester",
		Password: "definitely-wrong",
	}))
	connectErr := new(connect.Error)
	if ok := asConnectError(err, &connectErr); !ok || connectErr.Code() != connect.CodeUnauthenticated {
		t.Fatalf("err = %v, want CodeUnauthenticated", err)
	}
}

func TestLoginUnknownUser(t *testing.T) {
	client, cleanup := newAuthClient(t)
	defer cleanup()

	_, err := client.Login(context.Background(), connect.NewRequest(&studiov1.LoginRequest{
		Username: "who-is-this",
		Password: "whatever",
	}))
	connectErr := new(connect.Error)
	if ok := asConnectError(err, &connectErr); !ok || connectErr.Code() != connect.CodeUnauthenticated {
		t.Fatalf("err = %v, want CodeUnauthenticated", err)
	}
}

func asConnectError(err error, target **connect.Error) bool {
	if e, ok := err.(*connect.Error); ok {
		*target = e
		return true
	}
	return false
}

func TestSeedIdempotent(t *testing.T) {
	ctx := context.Background()
	db, err := database.Connect(ctx, testDBURL(t))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	if _, err := db.Pool.Exec(ctx, `TRUNCATE users`); err != nil {
		t.Fatalf("clean users: %v", err)
	}

	hash, err := auth.HashPassword("original")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	first, err := SeedSingleAccount(ctx, db.Pool, "seed-user", hash)
	if err != nil || !first {
		t.Fatalf("first seed: created=%v err=%v", first, err)
	}
	second, err := SeedSingleAccount(ctx, db.Pool, "seed-user", "different-hash")
	if err != nil {
		t.Fatalf("second seed: %v", err)
	}
	if second {
		t.Error("second seed must not create anything")
	}
	user, err := db.Queries.GetUserByUsername(ctx, "seed-user")
	if err != nil {
		t.Fatalf("get user: %v", err)
	}
	if user.PasswordHash != hash {
		t.Error("restart seed overwrote password hash")
	}
}

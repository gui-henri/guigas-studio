package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/encoding/protojson"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/middleware"
	"github.com/gui-henri/guigas-studio/backend/internal/testutil"
	"github.com/gui-henri/guigas-studio/backend/internal/workspace"
)

const testJWTSecret = "jwt-secret-jwt-secret-jwt-s"

const baseScriptJSON = `{
  "post": "review-demo",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 8 },
  "segments": [
    { "id": "hook", "beat": "BEAT_HOOK", "emotion": "EMOTION_SURPRISED",
      "narration_pt": "Gancho original." },
    { "id": "cta", "beat": "BEAT_CTA", "emotion": "EMOTION_IDLE",
      "narration_pt": "CTA." }
  ]
}`

func editedScriptJSON(t *testing.T) *studiov1.StudioScript {
	t.Helper()
	script := &studiov1.StudioScript{}
	opts := protojsonUnmarshalOptions()
	if err := opts.Unmarshal([]byte(strings.Replace(
		baseScriptJSON,
		"Gancho original.",
		"Gancho editado na UI.",
		1,
	)), script); err != nil {
		t.Fatalf("parse edited script: %v", err)
	}
	return script
}

func protojsonUnmarshalOptions() protojson.UnmarshalOptions {
	return protojson.UnmarshalOptions{DiscardUnknown: true}
}

func sqlcCreateVideoParams(slug string) sqlc.CreateVideoParams {
	return sqlc.CreateVideoParams{
		Slug:      slug,
		Title:     "Review Demo",
		SourceUrl: "https://blog.example.com/" + slug,
	}
}

func sqlcUpdateStatusParams(id uuid.UUID, status videostate.State) sqlc.UpdateVideoStatusParams {
	return sqlc.UpdateVideoStatusParams{ID: id, Status: string(status)}
}

func workspaceScaffold(dataDir, slug string, post []byte) (string, error) {
	return workspace.Scaffold(dataDir, slug, post)
}

// newReviewService mounts the full VideoService behind the auth interceptor
// and returns a client authorized as a fixed user.
func newReviewService(t *testing.T) (studiov1connect.VideoServiceClient, *database.DB, string, func()) {
	t.Helper()
	ctx := context.Background()
	url := testutil.DatabaseURL(t, "services")
	if url == "" {
		t.Skip("STUDIO_TEST_DATABASE_URL/TEST_DATABASE_URL not set; skipping integration test")
	}
	db, err := database.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	dataDir := t.TempDir()

	interceptor := middleware.NewAuthInterceptor(func(raw string) (*auth.Claims, error) {
		return auth.ParseToken(testJWTSecret, raw)
	}, "")

	mux := new(http.ServeMux)
	mux.Handle(studiov1connect.NewVideoServiceHandler(
		NewVideoService(db.Queries, dataDir, nil),
		connect.WithInterceptors(interceptor),
	))
	srv := httptest.NewServer(mux)

	token, _, err := auth.IssueToken(testJWTSecret, "11111111-1111-1111-1111-111111111111", time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	clientOpt := connect.WithInterceptors(authHeaderInterceptor(token))
	client := studiov1connect.NewVideoServiceClient(srv.Client(), srv.URL, clientOpt)

	cleanup := func() {
		srv.Close()
		db.Pool.Close()
	}
	return client, db, dataDir, cleanup
}

func authHeaderInterceptor(token string) connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			req.Header().Set("Authorization", "Bearer "+token)
			return next(ctx, req)
		})
	})
}

func seedReviewVideo(t *testing.T, ctx context.Context, db *database.DB, slug, dataDir string) *studiov1.Video {
	t.Helper()
	video, err := db.Queries.CreateVideo(ctx, sqlcCreateVideoParams(slug))
	if err != nil {
		t.Fatalf("create video: %v", err)
	}
	if _, err := workspaceScaffold(dataDir, slug, []byte("# demo")); err != nil {
		t.Fatalf("scaffold: %v", err)
	}
	scriptPath := filepath.Join(dataDir, "videos", slug, "script.json")
	if err := os.WriteFile(scriptPath, []byte(baseScriptJSON), 0o644); err != nil {
		t.Fatalf("write script: %v", err)
	}
	if err := db.Queries.UpdateVideoStatus(ctx, sqlcUpdateStatusParams(video.ID, videostate.StateScriptReview)); err != nil {
		t.Fatalf("set status: %v", err)
	}
	return &studiov1.Video{Id: video.ID.String(), Slug: video.Slug}
}

func TestScriptReviewFlow(t *testing.T) {
	client, db, dataDir, cleanup := newReviewService(t)
	defer cleanup()

	ctx := context.Background()
	if _, err := db.Pool.Exec(ctx, `TRUNCATE video_artifact_parses, rss_items, videos, users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	seeded := seedReviewVideo(t, ctx, db, "review-flow-demo", dataDir)

	// GetVideo exposes parsed script + artifacts presence.
	got, err := client.GetVideo(ctx, connect.NewRequest(&studiov1.GetVideoRequest{Id: seeded.Id}))
	if err != nil {
		t.Fatalf("GetVideo: %v", err)
	}
	if got.Msg.GetScript() == nil || len(got.Msg.GetScript().GetSegments()) != 2 {
		t.Fatal("GetVideo did not return parsed script")
	}
	if !got.Msg.GetArtifacts().GetScript() {
		t.Error("artifacts.script should be present")
	}

	// UpdateScript succeeds in script_review, writes file and commits.
	upd, err := client.UpdateScript(ctx, connect.NewRequest(&studiov1.UpdateScriptRequest{
		VideoId: seeded.Id,
		Script:  editedScriptJSON(t),
	}))
	if err != nil {
		t.Fatalf("UpdateScript: %v", err)
	}
	if len(upd.Msg.GetErrors()) > 0 {
		t.Fatalf("UpdateScript returned validation errors: %v", upd.Msg.GetErrors())
	}
	scriptPath := filepath.Join(dataDir, "videos", "review-flow-demo", "script.json")
	raw, _ := os.ReadFile(scriptPath)
	if !strings.Contains(string(raw), "Gancho editado na UI.") {
		t.Error("edited narration not written to disk")
	}
	logOut, gErr := exec.Command("git", "-C", filepath.Dir(scriptPath), "log", "--oneline").CombinedOutput()
	if gErr != nil || !strings.Contains(string(logOut), "update script via ui") {
		t.Errorf("expected UI update commit in workspace git: %s (%v)", logOut, gErr)
	}

	// ApproveScript moves to script_approved.
	approved, err := client.ApproveScript(ctx, connect.NewRequest(&studiov1.ApproveScriptRequest{VideoId: seeded.Id}))
	if err != nil {
		t.Fatalf("ApproveScript: %v", err)
	}
	if approved.Msg.GetVideo().GetStatus() != studiov1.VideoStatus_VIDEO_STATUS_SCRIPT_APPROVED {
		t.Errorf("status after approve = %s", approved.Msg.GetVideo().GetStatus())
	}

	// Approving again is refused by videostate (FailedPrecondition).
	_, err = client.ApproveScript(ctx, connect.NewRequest(&studiov1.ApproveScriptRequest{VideoId: seeded.Id}))
	if connectErr, ok := err.(*connect.Error); !ok || connectErr.Code() != connect.CodeFailedPrecondition {
		t.Errorf("second approve error = %v, want FailedPrecondition", err)
	}

	// History recorded with the acting user.
	detail, err := client.GetVideo(ctx, connect.NewRequest(&studiov1.GetVideoRequest{Id: seeded.Id}))
	if err != nil {
		t.Fatalf("GetVideo after approve: %v", err)
	}
	history := detail.Msg.GetStatusHistory()
	if len(history) == 0 || history[len(history)-1].GetActor() != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("history missing approve actor: %+v", history)
	}
}

func TestRejectScriptFlowAndInvalidUpdate(t *testing.T) {
	client, db, dataDir, cleanup := newReviewService(t)
	defer cleanup()

	ctx := context.Background()
	if _, err := db.Pool.Exec(ctx, `TRUNCATE video_artifact_parses, rss_items, videos, users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	seeded := seedReviewVideo(t, ctx, db, "reject-flow-demo", dataDir)

	// Invalid script: structured errors come back, nothing is written.
	badScript := editedScriptJSON(t)
	badScript.Segments[0].Beat = studiov1.Beat_BEAT_UNSPECIFIED
	upd, err := client.UpdateScript(ctx, connect.NewRequest(&studiov1.UpdateScriptRequest{
		VideoId: seeded.Id,
		Script:  badScript,
	}))
	if err != nil {
		t.Fatalf("UpdateScript transport error: %v", err)
	}
	if len(upd.Msg.GetErrors()) == 0 {
		t.Fatal("invalid script accepted without errors")
	}
	scriptPath := filepath.Join(dataDir, "videos", "reject-flow-demo", "script.json")
	raw, _ := os.ReadFile(scriptPath)
	if strings.Contains(string(raw), "Gancho editado") {
		t.Error("rejected script was written to disk")
	}

	// Reject returns to script_pending and records the comment.
	rejected, err := client.RejectScript(ctx, connect.NewRequest(&studiov1.RejectScriptRequest{
		VideoId: seeded.Id,
		Comment: "refaca o gancho, esta fraco",
	}))
	if err != nil {
		t.Fatalf("RejectScript: %v", err)
	}
	if rejected.Msg.GetVideo().GetStatus() != studiov1.VideoStatus_VIDEO_STATUS_SCRIPT_PENDING {
		t.Errorf("status after reject = %s, want SCRIPT_PENDING", rejected.Msg.GetVideo().GetStatus())
	}
	detail, err := client.GetVideo(ctx, connect.NewRequest(&studiov1.GetVideoRequest{Id: seeded.Id}))
	if err != nil {
		t.Fatalf("GetVideo after reject: %v", err)
	}
	found := false
	for _, h := range detail.Msg.GetStatusHistory() {
		if h.GetReason() == "refaca o gancho, esta fraco" {
			found = true
		}
	}
	if !found {
		t.Error("reject comment missing from history")
	}

	// UpdateScript while script_pending (not review) fails precondition.
	_, err = client.UpdateScript(ctx, connect.NewRequest(&studiov1.UpdateScriptRequest{
		VideoId: seeded.Id,
		Script:  editedScriptJSON(t),
	}))
	if connectErr, ok := err.(*connect.Error); !ok || connectErr.Code() != connect.CodeFailedPrecondition {
		t.Errorf("update in pending error = %v, want FailedPrecondition", err)
	}
}

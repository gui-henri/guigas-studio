package services

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

func TestGenerateScriptInvalidID(t *testing.T) {
	svc := NewVideoService(nil, t.TempDir(), nil, nil)
	_, err := svc.GenerateScript(context.Background(), connect.NewRequest(&studiov1.GenerateScriptRequest{VideoId: "not-a-uuid"}))
	if err == nil {
		t.Fatalf("GenerateScript = nil, want InvalidArgument")
	}
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}

func TestGenerateScriptWrongState(t *testing.T) {
	ctx := context.Background()
	db, err := database.Connect(ctx, testDBURL(t))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	svc := NewVideoService(db.Queries, t.TempDir(), nil, db.Pool)

	video, err := db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{Slug: fmt.Sprintf("gen-wrong-state-%d", time.Now().UnixNano()), Title: "T", SourceUrl: "http://x"})
	if err != nil {
		t.Fatalf("create video: %v", err)
	}
	_, err = svc.GenerateScript(ctx, connect.NewRequest(&studiov1.GenerateScriptRequest{VideoId: video.ID.String()}))
	if err == nil {
		t.Fatalf("GenerateScript = nil, want FailedPrecondition (status new)")
	}
	if connect.CodeOf(err) != connect.CodeFailedPrecondition {
		t.Errorf("code = %v, want FailedPrecondition", connect.CodeOf(err))
	}
}

func TestGenerateScriptDisabledReportsErrors(t *testing.T) {
	ctx := context.Background()
	db, err := database.Connect(ctx, testDBURL(t))
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	svc := NewVideoService(db.Queries, t.TempDir(), nil, db.Pool) // no generator

	video, err := db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{Slug: fmt.Sprintf("gen-disabled-%d", time.Now().UnixNano()), Title: "T", SourceUrl: "http://x"})
	if err != nil {
		t.Fatalf("create video: %v", err)
	}
	if err := db.Queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{ID: video.ID, Status: "script_pending"}); err != nil {
		t.Fatalf("update status: %v", err)
	}
	resp, err := svc.GenerateScript(ctx, connect.NewRequest(&studiov1.GenerateScriptRequest{VideoId: video.ID.String()}))
	if err != nil {
		t.Fatalf("GenerateScript = %v, want Errors response", err)
	}
	if len(resp.Msg.GetErrors()) == 0 || !strings.Contains(resp.Msg.GetErrors()[0], "GEMINI_API_KEY") {
		t.Errorf("errors = %v, want disabled message", resp.Msg.GetErrors())
	}
}

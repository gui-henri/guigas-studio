//go:build integration

package integration

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
	"github.com/gui-henri/guigas-studio/backend/internal/domain/videostate"
	"github.com/gui-henri/guigas-studio/backend/internal/upload"
	"github.com/gui-henri/guigas-studio/backend/internal/workspace"
)

func randomBytes(t *testing.T, n int) []byte {
	t.Helper()
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		t.Fatalf("rand: %v", err)
	}
	return b
}

func sha256Hex(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func acceptAllToken(string) (*auth.Claims, error) { return &auth.Claims{UserID: "tester"}, nil }

func TestUploadTakeResumableChunks(t *testing.T) {
	ctx := context.Background()
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping integration test")
	}
	db, err := database.Connect(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer db.Pool.Close()
	if _, err := db.Pool.Exec(ctx,
		`TRUNCATE takes, video_artifact_parses, video_status_history, rss_items, videos, users CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	dataDir := t.TempDir()

	video, err := db.Queries.CreateVideo(ctx, sqlc.CreateVideoParams{
		Slug: "upload-demo", Title: "Upload Demo", SourceUrl: "https://blog.example.com/upload-demo",
	})
	if err != nil {
		t.Fatalf("create video: %v", err)
	}
	if err := db.Queries.UpdateVideoStatus(ctx, sqlc.UpdateVideoStatusParams{
		ID: video.ID, Status: string(videostate.StateScriptApproved),
	}); err != nil {
		t.Fatalf("set status: %v", err)
	}

	wsRoot := filepath.Join(dataDir, "videos")
	if _, serr := workspace.Scaffold(dataDir, "upload-demo", []byte("# x")); serr != nil {
		t.Fatalf("scaffold: %v", serr)
	}
	validScript := `{"post":"upload-demo","language":{"spoken":"pt-BR","subtitles":"en"},
	 "target":{"durationMin":8},
	 "segments":[{"id":"seg-1","beat":"BEAT_HOOK","emotion":"EMOTION_IDLE","narration_pt":"a"}]}`
	scriptPath := filepath.Join(wsRoot, "upload-demo", "script.json")
	if err := os.WriteFile(scriptPath, []byte(validScript), 0o644); err != nil {
		t.Fatal(err)
	}

	handler := upload.NewHandler(db.Queries, db.Pool, dataDir, acceptAllToken)
	mux := new(http.ServeMux)
	mux.Handle("POST /api/v1/videos/{videoSlug}/takes", handler)
	mux.Handle("GET /api/v1/videos/{videoSlug}/takes", handler)
	srv := httptest.NewServer(mux)
	defer srv.Close()
	client := srv.Client()
	url := srv.URL + "/api/v1/videos/upload-demo/takes?segment_id=seg-1&kind=audio"

	payload := randomBytes(t, 5<<20) // 5 MB
	checksum := sha256Hex(payload)

	post := func(body []byte, offset int64, total int64, sum string) (*http.Response, []byte) {
		req, _ := http.NewRequest(http.MethodPost, url+"&offset="+fmt.Sprint(offset), bytes.NewReader(body))
		req.Header.Set("X-Total-Size", fmt.Sprint(total))
		req.Header.Set("X-Checksum-Sha256", sum)
		req.Header.Set("Authorization", "Bearer test")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("POST: %v", err)
		}
		defer resp.Body.Close()
		out, _ := io.ReadAll(resp.Body)
		return resp, out
	}

	// Chunk 1 of 3.
	resp1, body1 := post(payload[:2<<20], 0, int64(len(payload)), checksum)
	if resp1.StatusCode != 200 {
		t.Fatalf("chunk1 status=%d body=%s", resp1.StatusCode, body1)
	}
	if !strings.Contains(string(body1), `"next_offset":2097152`) {
		t.Errorf("chunk1 response = %s", body1)
	}

	// Probe: what does the server already have?
	probeReq, _ := http.NewRequest(http.MethodGet, url+"&probe=1", nil)
	probeReq.Header.Set("Authorization", "Bearer test")
	probeResp, pErr := client.Do(probeReq)
	if pErr != nil {
		t.Fatalf("probe: %v", pErr)
	}
	probeBody, _ := io.ReadAll(probeResp.Body)
	probeResp.Body.Close()
	if !strings.Contains(string(probeBody), `"size":2097152`) {
		t.Fatalf("probe says: %s", probeBody)
	}

	// Resume with the rest; final chunk completes the upload.
	resp2, body2 := post(payload[2<<20:], 2<<20, int64(len(payload)), checksum)
	if resp2.StatusCode != 200 || !strings.Contains(string(body2), `"complete":true`) {
		t.Fatalf("final chunk status=%d body=%s", resp2.StatusCode, body2)
	}

	got, rErr := os.ReadFile(filepath.Join(wsRoot, "upload-demo", "audio", "seg-1.wav"))
	if rErr != nil {
		t.Fatalf("read uploaded file: %v", rErr)
	}
	if !bytes.Equal(got, payload) || sha256Hex(got) != checksum {
		t.Error("uploaded bytes differ from payload")
	}

	takes, tErr := db.Queries.ListTakesByVideo(ctx, "upload-demo")
	if tErr != nil || len(takes) != 1 || takes[0].Kind != "audio" {
		t.Fatalf("takes = %+v (%v)", takes, tErr)
	}

	// First take promoted script_approved → recording exactly once.
	vFinal, gErr := db.Queries.GetVideoBySlug(ctx, "upload-demo")
	if gErr != nil || vFinal.Status != "recording" {
		t.Fatalf("status = %q (%v), want recording", vFinal.Status, gErr)
	}

	// Re-upload of the same segment+kind replaces (upsert) without re-transition.
	payload2 := randomBytes(t, 1<<20)
	_, b2 := post(payload2, 0, int64(len(payload2)), sha256Hex(payload2))
	if !strings.Contains(string(b2), `"complete":true`) {
		t.Fatalf("re-upload failed: %s", b2)
	}
	takes2, _ := db.Queries.ListTakesByVideo(ctx, "upload-demo")
	if len(takes2) != 1 {
		t.Errorf("re-upload created a second row (%d), want upsert", len(takes2))
	}
	history, hErr := db.Queries.ListStatusHistoryByVideo(ctx, video.ID)
	recordingEntries := 0
	if hErr == nil {
		for _, hh := range history {
			if hh.Status == "recording" {
				recordingEntries++
			}
		}
	}
	if recordingEntries != 1 {
		t.Errorf("recording history entries = %d, want 1", recordingEntries)
	}

	// Wrong checksum at finalize → 409, partial preserved, nothing recorded.
	bad := randomBytes(t, 3<<20)
	respBad, _ := post(bad[:1<<20], 0, int64(len(bad)), strings.Repeat("ab", 32))
	if respBad.StatusCode != 200 {
		t.Fatalf("bad-checksum chunk1 status=%d", respBad.StatusCode)
	}
	respBad2, bodyBad2 := post(bad[1<<20:], 1<<20, int64(len(bad)), strings.Repeat("cd", 32)) // wrong checksum
	if respBad2.StatusCode != 409 {
		t.Errorf("mismatched finalize status = %d, want 409 (body=%s)", respBad2.StatusCode, bodyBad2)
	}
	partial := filepath.Join(wsRoot, "upload-demo", "audio", ".partials", "seg-1.audio.part")
	if fi, statErr := os.Stat(partial); statErr != nil || fi.Size() != int64(len(bad)) {
		t.Errorf("partial not preserved after mismatch (%v)", statErr)
	}
	takesAfterBad, _ := db.Queries.ListTakesByVideo(ctx, "upload-demo")
	if len(takesAfterBad) != 1 {
		t.Errorf("failed upload recorded a take (%d rows), want 1", len(takesAfterBad))
	}
}

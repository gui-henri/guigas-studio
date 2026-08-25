package gemini

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

const fixtureWords = "```json\n{\"words\":[" +
	"{\"text\":\"Olha\",\"start_ms\":0,\"end_ms\":320}," +
	"{\"text\":\"o\",\"start_ms\":320,\"end_ms\":380}," +
	"{\"text\":\"diff\",\"start_ms\":380,\"end_ms\":900}" +
	"]}\n```"

func okResponse(wordsJSON string) string {
	return `{"candidates":[{"content":{"parts":[{"text":` + quote(wordsJSON) + `}]}}],
		"usageMetadata":{"promptTokenCount":120,"candidatesTokenCount":45}}`
}

func quote(s string) string {
	b, _ := jsonQuote(s)
	return b
}

// tiny helper to avoid importing strconv for escaping
func jsonQuote(s string) (string, error) {
	buf := []byte{'"'}
	for _, r := range s {
		switch r {
		case '"':
			buf = append(buf, '\\', '"')
		case '\n':
			buf = append(buf, '\\', 'n')
		default:
			buf = append(buf, []byte(string(r))...)
		}
	}
	return string(append(buf, '"')), nil
}

func testWav(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "seg.wav")
	if err := os.WriteFile(path, []byte("RIFF-fake-payload"), 0o644); err != nil {
		t.Fatal(err)
	}
	return path
}

func newFastClient(t *testing.T, serverURL string) *Client {
	t.Helper()
	c, err := New(Config{APIKey: "test-key", BackoffBase: time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	c.SetEndpoint(serverURL)
	return c
}

func TestTranscribeHappyPath(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		_, _ = w.Write([]byte(okResponse(fixtureWords)))
	}))
	defer srv.Close()

	result, err := newFastClient(t, srv.URL).Transcribe(context.Background(), testWav(t))
	if err != nil {
		t.Fatalf("transcribe: %v", err)
	}
	if len(result.Words) != 3 || result.Words[0].Text != "Olha" || result.Words[2].EndMs != 900 {
		t.Fatalf("words = %+v", result.Words)
	}
	if result.PromptTokens != 120 || result.OutputTokens != 45 {
		t.Errorf("usage = %d/%d", result.PromptTokens, result.OutputTokens)
	}
}

func TestRetryOn429ThenSuccess(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":{"code":429,"message":"rate limited"}}`))
			return
		}
		_, _ = w.Write([]byte(okResponse(fixtureWords)))
	}))
	defer srv.Close()

	result, err := newFastClient(t, srv.URL).Transcribe(context.Background(), testWav(t))
	if err != nil {
		t.Fatalf("expected success after retry: %v", err)
	}
	if len(result.Words) != 3 {
		t.Fatal("bad words after retry")
	}
	if calls != 2 {
		t.Errorf("calls = %d, want 2 (one retry)", calls)
	}
}

func TestExhaustedRetriesOn500(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	_, err := newFastClient(t, srv.URL).Transcribe(context.Background(), testWav(t))
	if err == nil {
		t.Fatal("expected error after exhausting retries")
	}
	if calls != maxAttempts {
		t.Errorf("calls = %d, want %d", calls, maxAttempts)
	}
	if !contains(err.Error(), "exhausted") {
		t.Errorf("error should mention exhaustion: %v", err)
	}
}

func Test4xxFailsFastWithoutRetry(t *testing.T) {
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"code":400,"message":"invalid payload"}}`))
	}))
	defer srv.Close()

	_, err := newFastClient(t, srv.URL).Transcribe(context.Background(), testWav(t))
	if err == nil {
		t.Fatal("expected error")
	}
	if calls != 1 {
		t.Errorf("calls = %d, want exactly 1 (no retry on 4xx)", calls)
	}
}

func TestMissingAPIKeyRejected(t *testing.T) {
	if _, err := New(Config{}); err == nil {
		t.Error("expected error without API key")
	}
}

func contains(s, sub string) bool {
	return len(sub) > 0 && len(s) >= len(sub) && indexOfStr(s, sub) >= 0
}

func indexOfStr(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

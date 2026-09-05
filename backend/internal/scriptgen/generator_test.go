package scriptgen

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

type fakeClient struct {
	responses []string
	err       error
	calls     int
}

func (f *fakeClient) GenerateScript(_ context.Context, _ string, _ []byte) (string, error) {
	f.calls++
	if f.err != nil {
		return "", f.err
	}
	if f.calls <= len(f.responses) {
		return f.responses[f.calls-1], nil
	}
	return f.responses[len(f.responses)-1], nil
}

func acceptAll([]byte) []string { return nil }

func setupVideoDir(t *testing.T, slug string) string {
	t.Helper()
	dataDir := t.TempDir()
	ctxDir := filepath.Join(dataDir, "videos", slug, "context")
	if err := os.MkdirAll(ctxDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(ctxDir, "post.md"), []byte("# Post"), 0o644); err != nil {
		t.Fatal(err)
	}
	return dataDir
}

func TestGenerateForSlugWritesValidScript(t *testing.T) {
	dataDir := setupVideoDir(t, "slug")
	fake := &fakeClient{responses: []string{`{"post":"slug"}`}}

	if err := GenerateForSlug(context.Background(), fake, acceptAll, dataDir, "slug", "Title", []byte(`{"type":"object"}`), 3); err != nil {
		t.Fatalf("GenerateForSlug = %v", err)
	}
	raw, err := os.ReadFile(filepath.Join(dataDir, "videos", "slug", "script.json"))
	if err != nil {
		t.Fatalf("read script.json = %v", err)
	}
	if string(raw) != `{"post":"slug"}` {
		t.Errorf("script.json = %q", raw)
	}
	if fake.calls != 1 {
		t.Errorf("calls = %d, want 1", fake.calls)
	}
}

func TestGenerateForSlugRetriesThenWrites(t *testing.T) {
	dataDir := setupVideoDir(t, "slug")
	fake := &fakeClient{responses: []string{`bad`, `{"post":"slug"}`}}
	attempt := 0
	validate := func(data []byte) []string {
		attempt++
		if attempt == 1 {
			return []string{"invalid JSON"}
		}
		return nil
	}

	if err := GenerateForSlug(context.Background(), fake, validate, dataDir, "slug", "Title", nil, 3); err != nil {
		t.Fatalf("GenerateForSlug = %v", err)
	}
	if fake.calls != 2 {
		t.Errorf("calls = %d, want 2", fake.calls)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "videos", "slug", "script.json")); err != nil {
		t.Errorf("script.json missing: %v", err)
	}
}

func TestGenerateForSlugExhaustedWritesNothing(t *testing.T) {
	dataDir := setupVideoDir(t, "slug")
	fake := &fakeClient{responses: []string{`bad`}}
	validate := func([]byte) []string { return []string{"always invalid"} }

	if err := GenerateForSlug(context.Background(), fake, validate, dataDir, "slug", "Title", nil, 2); err == nil {
		t.Fatalf("GenerateForSlug = nil, want error")
	}
	if _, err := os.Stat(filepath.Join(dataDir, "videos", "slug", "script.json")); !os.IsNotExist(err) {
		t.Errorf("script.json should not exist on exhaustion")
	}
}

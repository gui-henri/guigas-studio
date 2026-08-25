package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScaffoldCreatesCanonicalTree(t *testing.T) {
	dataDir := t.TempDir()
	root, err := Scaffold(dataDir, "2026-08-25-demo", []byte("# Demo\n\nCorpo do post."))
	if err != nil {
		t.Fatalf("scaffold: %v", err)
	}
	for _, rel := range []string{
		"context/AGENTS.md",
		"context/post.md",
		"context/method/beats.md",
		"context/method/shorts.md",
		"context/linked",
		"audio",
		"timelines",
		"assets",
		"renders",
		"releases/youtube",
		"releases/shorts",
		"releases/x",
		"releases/linkedin",
		"releases/instagram",
	} {
		if _, err := os.Stat(filepath.Join(root, rel)); err != nil {
			t.Errorf("missing workspace entry %s", rel)
		}
	}

	post, err := os.ReadFile(filepath.Join(root, "context", "post.md"))
	if err != nil || string(post) != "# Demo\n\nCorpo do post." {
		t.Errorf("post.md = %q, %v", post, err)
	}
	agents, err := os.ReadFile(filepath.Join(root, "context", "AGENTS.md"))
	if err != nil || len(agents) == 0 {
		t.Errorf("AGENTS.md missing or empty: %v", err)
	}
	gitignore, err := os.ReadFile(filepath.Join(root, ".gitignore"))
	if err != nil || !contains(gitignore, "*.wav") {
		t.Errorf(".gitignore must ignore binary artifacts: %q, %v", gitignore, err)
	}
}

func TestScaffoldIsIdempotent(t *testing.T) {
	dataDir := t.TempDir()
	root, err := Scaffold(dataDir, "demo-idem", []byte("versão original"))
	if err != nil {
		t.Fatalf("scaffold 1: %v", err)
	}
	// Simulate agent work: rewrite AGENTS.md and post.md.
	if err := os.WriteFile(filepath.Join(root, "context", "AGENTS.md"), []byte("AGENT WORK"), 0o644); err != nil {
		t.Fatalf("simulate agent write: %v", err)
	}
	if _, err := Scaffold(dataDir, "demo-idem", []byte("versão nova")); err != nil {
		t.Fatalf("scaffold 2: %v", err)
	}
	agents, _ := os.ReadFile(filepath.Join(root, "context", "AGENTS.md"))
	if string(agents) != "AGENT WORK" {
		t.Error("second scaffold overwrote AGENTS.md")
	}
	post, _ := os.ReadFile(filepath.Join(root, "context", "post.md"))
	if string(post) != "versão original" {
		t.Errorf("second scaffold overwrote post.md: %q", post)
	}
}

func contains(haystack []byte, needle string) bool {
	return len(needle) > 0 &&
		len(haystack) >= len(needle) &&
		indexOf(haystack, needle) >= 0
}

func indexOf(haystack []byte, needle string) int {
	n := len(needle)
	for i := 0; i+n <= len(haystack); i++ {
		if string(haystack[i:i+n]) == needle {
			return i
		}
	}
	return -1
}

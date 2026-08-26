// Package workspace materializes the canonical per-video workspace on disk
// (ROADMAP → Workspace canônico; T-07: /data/videos is its own git repo).
package workspace

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/gui-henri/guigas-studio/backend/internal/templates"
)

var (
	agentsMD = templates.Agents()
	beatsMD  = templates.MethodBeat()
	shortsMD = templates.MethodShorts()

	gitignoreBody = []byte(`# Binary artifacts never enter the workspace git (D-11)
audio/
renders/
*.wav
*.mp4
*.mkv
*.webm
.validation-latest.json
`)
)

// Scaffold creates the full workspace tree for a video and copies the context
// pack templates. It never overwrites existing files (idempotent).
func Scaffold(dataDir, slug string, postMarkdown []byte) (string, error) {
	root := filepath.Join(dataDir, "videos", slug)

	for _, d := range []string{
		filepath.Join(root, "context", "linked"),
		filepath.Join(root, "context", "method"),
		filepath.Join(root, "audio"),
		filepath.Join(root, "timelines"),
		filepath.Join(root, "assets"),
		filepath.Join(root, "renders"),
		filepath.Join(root, "releases", "youtube"),
		filepath.Join(root, "releases", "shorts"),
		filepath.Join(root, "releases", "x"),
		filepath.Join(root, "releases", "linkedin"),
		filepath.Join(root, "releases", "instagram"),
	} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return "", fmt.Errorf("create dir %s: %w", d, err)
		}
	}

	writes := []struct {
		path string
		body []byte
	}{
		{filepath.Join(root, "context", "AGENTS.md"), agentsMD},
		{filepath.Join(root, "context", "method", "beats.md"), beatsMD},
		{filepath.Join(root, "context", "method", "shorts.md"), shortsMD},
		{filepath.Join(root, "context", "post.md"), postMarkdown},
		{filepath.Join(root, ".gitignore"), gitignoreBody},
	}
	for _, w := range writes {
		if err := writeIfMissing(w.path, w.body); err != nil {
			return "", err
		}
	}
	return root, nil
}

// writeIfMissing writes body only when path does not exist yet.
func writeIfMissing(path string, body []byte) error {
	if _, err := os.Stat(path); err == nil {
		return nil // idempotency: never overwrite agent/server work
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("stat %s: %w", path, err)
	}
	if err := os.WriteFile(path, body, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", path, err)
	}
	return nil
}

// Commit stages everything under root and commits with the given message,
// configuring local identity on first use so the server never depends on host git config.
func Commit(root, message string) error {
	if err := ensureGitRepo(root); err != nil {
		return err
	}
	if err := runGit(root, "add", "-A"); err != nil {
		return err
	}
	cmd := exec.Command("git", "commit", "-m", message, "--allow-empty")
	cmd.Dir = root
	out, err := cmd.CombinedOutput()
	if err != nil && !bytes.Contains(out, []byte("nothing to commit")) {
		return fmt.Errorf("git commit in %s: %s: %w", root, out, err)
	}
	return nil
}

func ensureGitRepo(root string) error {
	gitDir := filepath.Join(root, ".git")
	if _, err := os.Stat(gitDir); os.IsNotExist(err) {
		if err := runGit(root, "init"); err != nil {
			return fmt.Errorf("git init in %s: %w", root, err)
		}
		if err := runGit(root, "config", "user.name", "Studio Server"); err != nil {
			return err
		}
		if err := runGit(root, "config", "user.email", "studio@guigas.local"); err != nil {
			return err
		}
	}
	return nil
}

func runGit(dir string, args ...string) error {
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

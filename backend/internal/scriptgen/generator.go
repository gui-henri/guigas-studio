package scriptgen

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/gui-henri/guigas-studio/backend/internal/workspace"
)

// ScriptClient is satisfied by *gemini.Client (GenerateScript) and by
// test fakes. Declared here to avoid an import cycle.
type ScriptClient interface {
	GenerateScript(ctx context.Context, prompt string, responseSchema []byte) (string, error)
}

// Validator validates raw script JSON, returning human-readable errors.
// Wire artifacts.ValidateScript here (adapter in the caller).
type Validator func(data []byte) []string

// GenerateForSlug runs the prompt -> generate -> validate loop and writes
// script.json atomically (tmp + rename) only when valid. It never writes
// invalid content, so the fsnotify observer only sees one valid parse.
// maxAttempts caps the retry loop; prevErrors are fed back into the prompt.
func GenerateForSlug(ctx context.Context, gen ScriptClient, validate Validator, dataDir, slug, title string, schema []byte, maxAttempts int) error {
	if maxAttempts < 1 {
		maxAttempts = 1
	}
	postMD, agentsMD, beatsMD, shortsMD := LoadContextPack(dataDir, slug)
	var prevErrors []string
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		prompt := BuildPrompt(slug, title, postMD, agentsMD, beatsMD, shortsMD, prevErrors, DefaultDurationMin)
		raw, err := gen.GenerateScript(ctx, prompt, schema)
		if err != nil {
			slog.Warn("scriptgen.attempt", slog.String("slug", slug), slog.Int("attempt", attempt), slog.Any("error", err))
			prevErrors = []string{fmt.Sprintf("generation failed: %v", err)}
			continue
		}
		if errs := validate([]byte(raw)); len(errs) > 0 {
			slog.Warn("scriptgen.attempt",
				slog.String("slug", slug), slog.Int("attempt", attempt),
				slog.Int("errCount", len(errs)))
			prevErrors = errs
			continue
		}
		if err := writeScriptAtomic(dataDir, slug, []byte(raw)); err != nil {
			return err
		}
		// Version the generated text like UpdateScript does; a failed commit
		// only warns (the file is already valid on disk for the observer).
		root := filepath.Join(dataDir, "videos", slug)
		if err := workspace.Commit(root, fmt.Sprintf("feat(%s): generate script via gemini", slug)); err != nil {
			slog.Warn("scriptgen.commit_failed", slog.String("slug", slug), slog.Any("error", err))
		}
		slog.Info("scriptgen.done", slog.String("slug", slug), slog.Int("attempt", attempt))
		return nil
	}
	agg, _ := json.Marshal(prevErrors)
	return fmt.Errorf("scriptgen: exhausted %d attempts: %s", maxAttempts, string(agg))
}

func writeScriptAtomic(dataDir, slug string, raw []byte) error {
	if !json.Valid(raw) {
		return fmt.Errorf("scriptgen: model output is not valid JSON")
	}
	root := filepath.Join(dataDir, "videos", slug)
	tmp := filepath.Join(root, "script.json.tmp")
	final := filepath.Join(root, "script.json")
	if err := os.WriteFile(tmp, raw, 0o644); err != nil {
		return fmt.Errorf("write tmp: %w", err)
	}
	if err := os.Rename(tmp, final); err != nil {
		return fmt.Errorf("rename: %w", err)
	}
	return nil
}

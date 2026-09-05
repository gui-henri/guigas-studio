// Package scriptgen builds the structured prompt used for automatic
// StudioScript generation via the Gemini API (GenerateScript).
//
// It reads the per-video context pack written by workspace.Scaffold
// (<DATA_DIR>/videos/<slug>/context/...) and produces a single prompt
// string. Validation and persistence stay in the caller so this package
// has no database dependency.
package scriptgen

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Defaults for prompt assembly.
const (
	DefaultDurationMin = 10
	MinDurationMin     = 4
	MaxDurationMin     = 30
)

// BuildPrompt assembles the script prompt. prevErrors carries the
// validation messages of a rejected attempt (retry loop) and is
// appended as mandatory corrections; empty means first attempt.
func BuildPrompt(slug, title, postMD, agentsMD, beatsMD, shortsMD string, prevErrors []string, durationMin int) string {
	if durationMin < MinDurationMin || durationMin > MaxDurationMin {
		durationMin = DefaultDurationMin
	}
	var b strings.Builder
	b.WriteString("Você é o roteirista do Guigas Studio. Leia as convenções abaixo e responda APENAS com JSON válido do roteiro (sem markdown, sem cercas).\n\n")
	if agentsMD != "" {
		b.WriteString("## Convenções (context/AGENTS.md)\n" + agentsMD + "\n\n")
	}
	if beatsMD != "" {
		b.WriteString("## Beats (context/method/beats.md)\n" + beatsMD + "\n\n")
	}
	if shortsMD != "" {
		b.WriteString("## Shorts (context/method/shorts.md)\n" + shortsMD + "\n\n")
	}
	fmt.Fprintf(&b, "## Vídeo\nslug: %s\ntítulo: %s\ntarget.durationMin: %d\nlanguage: spoken=pt-BR subtitles=en\n\n", slug, title, durationMin)
	b.WriteString("## Post de origem (context/post.md)\n" + postMD + "\n\n")
	b.WriteString("Regras duras: enums Beat/Emotion em MAIÚSCULAS (BEAT_HOOK, EMOTION_IDLE, ...); narration_pt em pt-BR; scene null ou 1 dos 7 tipos; short com id sequencial 1..N e hook+cta não-vazios; segments >= 1.\n")
	if len(prevErrors) > 0 {
		b.WriteString("\n## Correções exigidas (tentativa anterior rejeitada pelo validador — corrija TODAS)\n")
		for _, e := range prevErrors {
			b.WriteString("- " + e + "\n")
		}
	}
	return b.String()
}

// LoadContextPack reads the per-video context files. Missing method files
// fall back to empty strings (caller may substitute embedded templates).
func LoadContextPack(dataDir, slug string) (postMD, agentsMD, beatsMD, shortsMD string) {
	root := filepath.Join(dataDir, "videos", slug, "context")
	read := func(rel string) string {
		raw, err := os.ReadFile(filepath.Join(root, rel))
		if err != nil {
			return ""
		}
		return string(raw)
	}
	return read("post.md"), read("AGENTS.md"), read(filepath.Join("method", "beats.md")), read(filepath.Join("method", "shorts.md"))
}

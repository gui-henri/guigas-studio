package scriptgen

import (
	"strings"
	"testing"
)

func TestBuildPromptFirstAttempt(t *testing.T) {
	p := BuildPrompt("slug", "Title", "post", "agents", "beats", "shorts", nil, 10)
	for _, want := range []string{"slug", "Title", "post", "agents", "beats", "shorts", "durationMin: 10", "BEAT_HOOK", "pt-BR"} {
		if !strings.Contains(p, want) {
			t.Errorf("prompt missing %q", want)
		}
	}
	if strings.Contains(p, "Correções exigidas") {
		t.Errorf("first attempt should not contain corrections section")
	}
}

func TestBuildPromptRetryIncludesErrors(t *testing.T) {
	p := BuildPrompt("slug", "Title", "post", "agents", "beats", "shorts", []string{"id duplicado: hook", "narração obrigatória"}, 10)
	for _, want := range []string{"Correções exigidas", "id duplicado: hook", "narração obrigatória"} {
		if !strings.Contains(p, want) {
			t.Errorf("retry prompt missing %q", want)
		}
	}
}

func TestBuildPromptDurationClamped(t *testing.T) {
	p := BuildPrompt("slug", "Title", "post", "", "", "", nil, 99)
	if !strings.Contains(p, "durationMin: 10") {
		t.Errorf("out-of-range duration should fall back to 10")
	}
}

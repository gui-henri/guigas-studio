package artifacts

import (
	"strings"
	"testing"
)

const goldenScript = `{
  "post": "2026-08-02-deepseek-drops-zdr-on-opencode-go",
  "language": { "spoken": "pt-BR", "subtitles": "en" },
  "target": { "durationMin": 10 },
  "related": ["/notes/2026-08-02-deepseek-zdr"],
  "segments": [
    {
      "id": "hook",
      "beat": "BEAT_HOOK",
      "emotion": "EMOTION_SURPRISED",
      "narration_pt": "A DeepSeek acabou de derrubar o ZDR — e o OpenCode já compilou tudo em Go.",
      "scene": null,
      "short": null
    },
    {
      "id": "exemplo-zdr",
      "beat": "BEAT_EXAMPLE",
      "emotion": "EMOTION_THOUGHTFUL",
      "narration_pt": "[SHORT#1] Olha o diff do parser: antes eram duzentas linhas, agora são quarenta.",
      "scene": {
        "type": "diff",
        "props": { "before": "200 linhas", "after": "40 linhas" }
      },
      "short": { "id": 1, "hook": "Duzentas linhas viraram quarenta.", "cta": "Post completo na bio" }
    },
    {
      "id": "cta",
      "beat": "BEAT_CTA",
      "emotion": "EMOTION_IDLE",
      "narration_pt": "Se curtiu, o post completo está no blog."
    }
  ],
  "social": {
    "x_thread": ["1/ A DeepSeek derrubou o ZDR"],
    "linkedin": "DeepSeek derrubou o ZDR.",
    "instagram_caption": "DeepSeek x ZDR 🚀"
  }
}`

func TestGoldenSpecExamplePasses(t *testing.T) {
	script, errs := ValidateScript([]byte(goldenScript))
	if len(errs) != 0 {
		t.Fatalf("expected zero errors, got: %v", errs)
	}
	if script.GetPost() != "2026-08-02-deepseek-drops-zdr-on-opencode-go" {
		t.Errorf("post = %q", script.GetPost())
	}
	if got := len(script.GetSegments()); got != 3 {
		t.Errorf("segments = %d, want 3", got)
	}
	if script.GetSegments()[1].GetShort().GetId() != 1 {
		t.Error("short marker id mismatch")
	}
}

func mutations(t *testing.T) map[string]string {
	t.Helper()
	return map[string]string{
		"unknown field": strings.Replace(goldenScript,
			`"target"`, `"desconhecido": true, "target"`, 1),
		"invalid beat": strings.Replace(goldenScript,
			`"beat": "BEAT_HOOK"`, `"beat": "BEAT_ABERTURA"`, 1),
		"short out of sequence": strings.Replace(goldenScript,
			`"id": 1, "hook": "Duzentas linhas viraram quarenta."`,
			`"id": 7, "hook": "Duzentas linhas viraram quarenta."`, 1),
		"duplicate segment id": strings.Replace(goldenScript,
			`"id": "cta",`, `"id": "hook",`, 1),
	}
}

func TestMutationsFailWithClearErrors(t *testing.T) {
	for name, body := range mutations(t) {
		t.Run(name, func(t *testing.T) {
			_, errs := ValidateScript([]byte(body))
			if len(errs) == 0 {
				t.Fatalf("mutation %q passed validation", name)
			}
		})
	}
}

func TestSchemaEnumNamesMatchProto(t *testing.T) {
	// Guards drift between the hand-maintained schema and generated proto enums.
	schemaBytes, err := StudioScriptSchema()
	if err != nil {
		t.Fatalf("schema missing: %v", err)
	}
	for _, want := range []string{
		"BEAT_HOOK", "BEAT_SETUP", "BEAT_EXAMPLE", "BEAT_PAYOFF", "BEAT_CTA",
		"EMOTION_IDLE", "EMOTION_SPEAKING", "EMOTION_HAPPY", "EMOTION_THOUGHTFUL", "EMOTION_SURPRISED",
	} {
		if !strings.Contains(string(schemaBytes), `"`+want+`"`) {
			t.Errorf("schema is missing enum value %s", want)
		}
	}
}

package alignment

import (
	"strings"
	"testing"

	"github.com/gui-henri/guigas-studio/backend/internal/transcription"
)

func words(pairs ...[3]any) []transcription.Word {
	out := make([]transcription.Word, 0, len(pairs))
	for _, p := range pairs {
		out = append(out, transcription.Word{
			Text:    p[0].(string),
			StartMs: p[1].(int),
			EndMs:   p[2].(int),
		})
	}
	return out
}

func TestHappyPathExactMatch(t *testing.T) {
	narration := "Olha o diff do parser, antes eram duzentas linhas."
	tr := words(
		[3]any{"olha", 0, 300},
		[3]any{"o", 300, 380},
		[3]any{"diff", 380, 800},
		[3]any{"do", 800, 950},
		[3]any{"parser", 950, 1500},
		[3]any{"antes", 1500, 1800},
		[3]any{"eram", 1800, 2100},
		[3]any{"duzentas", 2100, 2600},
		[3]any{"linhas", 2600, 3100},
	)
	got := Align(narration, tr)
	if got.Degenerate {
		t.Fatalf("unexpected degenerate: ratio=%.2f", got.MatchRatio)
	}
	if got.MatchRatio != 1 {
		t.Errorf("ratio = %.2f, want 1.0", got.MatchRatio)
	}
	if len(got.Timings) != 9 {
		t.Fatalf("timings = %d words, want 9", len(got.Timings))
	}
	// Display text always from narration (with punctuation).
	last := got.Timings[len(got.Timings)-1]
	if !strings.HasSuffix(last.Word, "linhas.") {
		t.Errorf("display word = %q, want narration form with punctuation", last.Word)
	}
	if first := got.Timings[0]; first.StartMs != 0 || first.EndMs != 300 {
		t.Errorf("first timing = %+v", first)
	}
}

func TestSubstitutionsKeepNarrationTextAndTranscriptTimes(t *testing.T) {
	narration := "custa vinte reais hoje"
	tr := words(
		[3]any{"custa", 0, 400},
		[3]any{"20", 400, 700}, // ASR wrote the number
		[3]any{"reais", 700, 1100},
		[3]any{"hoje", 1100, 1400},
	)
	got := Align(narration, tr)
	if got.Degenerate {
		t.Fatalf("unexpected degenerate: %.2f", got.MatchRatio)
	}
	second := got.Timings[1]
	if second.Word != "vinte" {
		t.Errorf("display = %q, want narration's %q", second.Word, "vinte")
	}
	if second.StartMs != 400 || second.EndMs != 700 {
		t.Errorf("substituted word times = %d..%d, want transcript's 400..700", second.StartMs, second.EndMs)
	}
}

func TestGapInterpolatedBetweenAnchors(t *testing.T) {
	narration := "a b c d e f g h i j"
	// Transcript caught a..c then jumped to g..j — d/e/f are mid-gaps.
	tr := words(
		[3]any{"a", 0, 100},
		[3]any{"b", 100, 200},
		[3]any{"c", 200, 300},
		[3]any{"g", 700, 800},
		[3]any{"h", 800, 900},
		[3]any{"i", 900, 1000},
		[3]any{"j", 1000, 1100},
	)
	got := Align(narration, tr)
	if got.Degenerate {
		t.Fatalf("degenerate: %.2f (matches: a,b,c,g,h,i,j + d,e,f inserted)", got.MatchRatio)
	}
	d, e, f := got.Timings[3], got.Timings[4], got.Timings[5]
	if d.Word != "d" || e.Word != "e" || f.Word != "f" {
		t.Fatalf("expected gap words d/e/f, got %q %q %q", d.Word, e.Word, f.Word)
	}
	// Anchors: c ends at 300, g starts at 700.
	for _, w := range []WordTiming{d, e, f} {
		if w.StartMs < 300 || w.EndMs > 700 {
			t.Errorf("interpolated word %q out of anchor window [300,700]: %+v", w.Word, w)
		}
	}
	if !(d.StartMs <= e.StartMs && e.StartMs <= f.StartMs) {
		t.Errorf("gap timings not monotonic: %+v %+v %+v", d, e, f)
	}
}

func TestLeadingAndTrailingGapsExtendEdges(t *testing.T) {
	narration := "um dois tres quatro cinco seis sete oito"
	tr := words(
		[3]any{"tres", 200, 300},
		[3]any{"quatro", 300, 400},
		[3]any{"cinco", 400, 500},
		[3]any{"seis", 500, 600},
		[3]any{"oito", 600, 700},
	)
	got := Align(narration, tr)
	if got.Degenerate {
		t.Fatalf("degenerate: %.2f", got.MatchRatio)
	}
	first := got.Timings[0]
	if first.StartMs < 0 {
		t.Errorf("leading gap negative start: %+v", first)
	}
	last := got.Timings[len(got.Timings)-1]
	if !strings.HasSuffix(last.Word, "oito") || last.StartMs < 600 {
		t.Errorf("trailing word should be oito extending beyond last anchor: %+v", last)
	}
}

func TestDegenerateFallsBackToRawTranscript(t *testing.T) {
	narration := "isto aqui nao tem nada a ver com aquilo"
	tr := words(
		[3]any{"completamente", 10, 200},
		[3]any{"diferente", 200, 400},
	)
	got := Align(narration, tr)
	if !got.Degenerate {
		t.Fatalf("expected degenerate, got ratio %.2f", got.MatchRatio)
	}
	if len(got.Timings) != len(tr) || got.Timings[0].Word != "completamente" {
		t.Error("fallback must return raw transcript timings")
	}
}

func TestEmptyTranscriptIsDegenerate(t *testing.T) {
	got := Align("qualquer coisa", nil)
	if !got.Degenerate || got.Timings != nil && len(got.Timings) != 0 {
		t.Errorf("empty transcript should yield degenerate empty result: %+v", got)
	}
}

func TestAccentsPreservedInMatching(t *testing.T) {
	narration := "você viu o código?"
	// "codigo" without accent must NOT match "código" (falls to substitution,
	// which is fine); but "você" with accent matches exactly.
	tr := words(
		[3]any{"voce", 0, 300},     // no accent → substitution
		[3]any{"viu", 300, 500},    // match
		[3]any{"o", 500, 560},      // match
		[3]any{"código", 560, 900}, // match
	)
	got := Align(narration, tr)
	if got.Degenerate {
		t.Fatalf("ratio %.2f too low; accent handling broken", got.MatchRatio)
	}
	if got.MatchRatio < 0.75 {
		t.Errorf("ratio = %.2f, want >= 0.75 (3/4 exact matches)", got.MatchRatio)
	}
}

func TestDeterministicOutput(t *testing.T) {
	narration := "um dois tres quatro"
	tr := words([3]any{"um", 0, 100}, [3]any{"dois", 100, 200}, [3]any{"tres", 200, 300})
	a := Align(narration, tr)
	b := Align(narration, tr)
	if len(a.Timings) != len(b.Timings) {
		t.Fatal("length mismatch")
	}
	for i := range a.Timings {
		if a.Timings[i] != b.Timings[i] {
			t.Fatalf("non-deterministic at %d: %+v vs %+v", i, a.Timings[i], b.Timings[i])
		}
	}
}

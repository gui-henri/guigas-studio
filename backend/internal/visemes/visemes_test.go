package visemes

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestParseRhubarbJSON(t *testing.T) {
	input := []byte(`{"mouthCues":[
		{"start":0.00,"end":0.35,"value":"X"},
		{"start":0.35,"end":0.60,"value":"A"},
		{"start":0.60,"end":0.90,"value":"C"},
		{"start":0.90,"end":1.20,"value":"F"}
	]}`)
	cues, err := ParseRhubarbJSON(input, 1200)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(cues) != 4 {
		t.Fatalf("cues = %d, want 4", len(cues))
	}
	if cues[1].Shape != ShapeA || cues[1].StartMs != 350 || cues[1].EndMs != 600 {
		t.Errorf("cue[1] = %+v", cues[1])
	}
}

func TestParseRejectsInvalidShape(t *testing.T) {
	input := []byte(`{"mouthCues":[{"start":0,"end":0.5,"value":"Z"}]}`)
	if _, err := ParseRhubarbJSON(input, 1000); err == nil {
		t.Error("expected error for shape Z")
	}
}

func TestValidateRejectsOutOfOrder(t *testing.T) {
	cues := []MouthCue{
		{Shape: ShapeB, StartMs: 500, EndMs: 800},
		{Shape: ShapeA, StartMs: 100, EndMs: 400},
	}
	if _, err := Validate(cues, 1000); err == nil {
		t.Error("expected out-of-order rejection")
	}
}

func TestValidateClampsToWavDuration(t *testing.T) {
	cues := []MouthCue{
		{Shape: ShapeX, StartMs: -50, EndMs: 200},
		{Shape: ShapeE, StartMs: 200, EndMs: 9000}, // beyond 1000ms wav
	}
	out, err := Validate(cues, 1000)
	if err != nil {
		t.Fatal(err)
	}
	if out[0].StartMs != 0 || out[1].EndMs != 1000 {
		t.Errorf("clamp failed: %+v", out)
	}
}

// fakeEngine returns canned cues and counts calls.
type fakeEngine struct {
	calls int
	cues  []MouthCue
}

func (f *fakeEngine) Recognize(context.Context, string) ([]MouthCue, error) {
	f.calls++
	return f.cues, nil
}

func TestCacheHitAvoidsReprocessing(t *testing.T) {
	dir := t.TempDir()
	wav := filepath.Join(dir, "seg-1.wav")
	if err := os.WriteFile(wav, []byte("RIFF-fake"), 0o644); err != nil {
		t.Fatal(err)
	}

	engine := &fakeEngine{cues: []MouthCue{
		{Shape: ShapeX, StartMs: 0, EndMs: 100},
		{Shape: ShapeA, StartMs: 100, EndMs: 300},
	}}

	first, err := RecognizeWithCache(context.Background(), engine, wav, "dialog", 300)
	if err != nil {
		t.Fatal(err)
	}
	if engine.calls != 1 {
		t.Fatalf("calls = %d, want 1", engine.calls)
	}

	second, err := RecognizeWithCache(context.Background(), engine, wav, "dialog", 300)
	if err != nil {
		t.Fatal(err)
	}
	if engine.calls != 1 {
		t.Errorf("cache miss on identical wav: calls = %d, want still 1", engine.calls)
	}
	for i := range first {
		if first[i] != second[i] {
			t.Errorf("cached cue %d differs: %+v vs %+v", i, first[i], second[i])
		}
	}

	// Sidecar exists with the wav checksum.
	raw, rErr := os.ReadFile(SidecarPath(wav))
	if rErr != nil {
		raw, rErr = os.ReadFile(wav + ".visemes.json")
	}
	if rErr != nil {
		t.Fatalf("sidecar missing: %v", rErr)
	}
	var sc sidecar
	if json.Unmarshal(raw, &sc) != nil || sc.WavSha256 == "" || len(sc.Cues) != 2 {
		t.Errorf("sidecar content invalid: %s", raw)
	}

	// Rewriting the wav changes the checksum → cache invalidated.
	if err := os.WriteFile(wav, []byte("RIFF-different-payload"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := RecognizeWithCache(context.Background(), engine, wav, "dialog", 300); err != nil {
		t.Fatal(err)
	}
	if engine.calls != 2 {
		t.Errorf("changed wav must reprocess: calls = %d, want 2", engine.calls)
	}
}

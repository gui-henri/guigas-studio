//go:build integration

package visemes

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

// TestExecEngineWithFakeBinary proves the auxiliary-binary execution path:
// a shell script standing in for the lip-sync tool emits valid Rhubarb JSON.
func TestExecEngineWithFakeBinary(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "fake-rhubarb.sh")
	script := `#!/bin/sh
# last arg is the wav path; emit canned rhubarb json
echo '{"mouthCues":[{"start":0.00,"end":0.40,"value":"X"},{"start":0.40,"end":1.00,"value":"B"}]}'
`
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}

	wav := filepath.Join(dir, "seg.wav")
	if err := os.WriteFile(wav, []byte("RIFF"), 0o644); err != nil {
		t.Fatal(err)
	}

	engine := NewExecEngineFromEnv("texto do dialogo")
	engine.Bin = bin
	engine.Timeout = 5000000000 // 5s in ns literal to avoid time import churn

	cues, err := RecognizeWithCache(context.Background(), engine, wav, "", 1000)
	if err != nil {
		t.Fatalf("exec engine: %v", err)
	}
	if len(cues) != 2 || cues[1].Shape != ShapeB || cues[1].EndMs != 1000 {
		t.Errorf("cues = %+v", cues)
	}
}

func TestExecEngineUnavailableWithoutBin(t *testing.T) {
	engine := NewExecEngineFromEnv("")
	_, err := engine.Recognize(context.Background(), "whatever.wav")
	if err == nil {
		t.Fatal("expected ErrUnavailable")
	}
}

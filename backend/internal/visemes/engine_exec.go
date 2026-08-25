package visemes

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"time"
)

// sha256File is provided by the cache file to avoid import churn.

// ExecEngine runs an external lip-sync binary (auxiliary-binary option,
// S3-03) that follows the Rhubarb CLI contract:
//
//	<bin> -f json --dialogFile <txt> <wav>  (stdout: rhubarb JSON)
//
// The official native Rhubarb build on the VPS satisfies this; a WASM runtime
// (wazero) can implement Engine later without touching callers.
type ExecEngine struct {
	// Bin is the path to the lip-sync executable.
	Bin string
	// Timeout bounds one recognition run.
	Timeout time.Duration
	// Dialog is the expected narration passed via --dialogFile.
	Dialog string
}

func NewExecEngineFromEnv(dialog string) *ExecEngine {
	return &ExecEngine{
		Bin:     os.Getenv("RHUBARB_BIN"),
		Timeout: 60 * time.Second,
		Dialog:  dialog,
	}
}

// Recognize implements Engine. Returns ErrUnavailable when the binary is not
// configured/present so callers can degrade explicitly.
func (e *ExecEngine) Recognize(ctx context.Context, wavPath string) ([]MouthCue, error) {
	if e.Bin == "" {
		return nil, fmt.Errorf("%w: RHUBARB_BIN is empty", ErrUnavailable)
	}
	if _, err := os.Stat(e.Bin); errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("%w: %s", ErrUnavailable, e.Bin)
	}

	dialogPath := wavPath + ".dialog.txt"
	if err := os.WriteFile(dialogPath, []byte(e.Dialog), 0o644); err != nil {
		return nil, fmt.Errorf("write dialog file: %w", err)
	}

	runCtx := ctx
	var cancel context.CancelFunc
	if e.Timeout > 0 {
		runCtx, cancel = context.WithTimeout(ctx, e.Timeout)
		defer cancel()
	}

	cmd := exec.CommandContext(runCtx, e.Bin, "-f", "json", "--dialogFile", dialogPath, wavPath)
	stdout, err := cmd.Output()
	if err != nil {
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) && ctx.Err() == nil {
			return nil, fmt.Errorf("recognition timed out after %s", e.Timeout)
		}
		return nil, fmt.Errorf("engine run: %w", err)
	}

	cues, err := ParseRhubarbJSON(stdout, mathMaxInt)
	if err != nil {
		return nil, err
	}
	return cues, nil
}

// wavDurationGuess keeps the signature honest until callers pass the manifest
// duration (S2-09); validation clamps only when a real duration is supplied.
func wavDurationGuess(string) int { return mathMaxInt }

const mathMaxInt = int(^uint(0) >> 1)

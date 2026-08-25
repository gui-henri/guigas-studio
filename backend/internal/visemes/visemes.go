// Package visemes wraps a lip-sync engine (Rhubarb contract: mouth shapes
// A–H + X) behind a swappable interface. The webcam never feeds the mouth
// (SPEC §2 #5) — visemes derive purely from the segment audio.
package visemes

import (
	"context"
	"errors"
	"fmt"
)

// Shape vocabulary: A–H plus X (silence).
const (
	ShapeA = 'A'
	ShapeB = 'B'
	ShapeC = 'C'
	ShapeD = 'D'
	ShapeE = 'E'
	ShapeF = 'F'
	ShapeG = 'G'
	ShapeH = 'H'
	ShapeX = 'X'
)

// MouthCue is one mouth shape over a time window.
type MouthCue struct {
	Shape   byte // A..H | X
	StartMs int
	EndMs   int
}

// Engine recognizes mouth cues from a WAV file.
type Engine interface {
	Recognize(ctx context.Context, wavPath string) ([]MouthCue, error)
}

// ErrUnavailable is returned when the configured engine artifact is missing.
var ErrUnavailable = errors.New("viseme engine unavailable")

func validateShape(b byte) error {
	switch b {
	case ShapeA, ShapeB, ShapeC, ShapeD, ShapeE, ShapeF, ShapeG, ShapeH, ShapeX:
		return nil
	default:
		return fmt.Errorf("invalid mouth shape %q", string(rune(b)))
	}
}

// Validate enforces the output contract: known shapes, time-ordered cues,
// non-negative durations, clamped to the WAV length.
func Validate(cues []MouthCue, wavDurationMs int) ([]MouthCue, error) {
	if len(cues) == 0 {
		return nil, errors.New("empty mouth cue list")
	}
	out := make([]MouthCue, len(cues))
	prevStart := -1
	for i, c := range cues {
		if err := validateShape(c.Shape); err != nil {
			return nil, fmt.Errorf("cue %d: %w", i, err)
		}
		start, end := c.StartMs, c.EndMs
		if start < 0 {
			start = 0
		}
		if end > wavDurationMs {
			end = wavDurationMs
		}
		if end < start {
			end = start
		}
		if start < prevStart {
			return nil, fmt.Errorf("cue %d out of order: %dms after %dms", i, start, prevStart)
		}
		prevStart = start
		out[i] = MouthCue{Shape: c.Shape, StartMs: start, EndMs: end}
	}
	return out, nil
}

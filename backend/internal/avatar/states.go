// Package avatar ports the blendshape→sprite-state mapping (S2-03, browser)
// to Go so the render pipeline reproduces the exact same decisions.
package avatar

import (
	"fmt"
)

// SpriteState vocabulary shared with the TS side.
type SpriteState string

const (
	StateIdle       SpriteState = "idle"
	StateTalking    SpriteState = "talking"
	StateHappy      SpriteState = "happy"
	StateThoughtful SpriteState = "thoughtful"
	StateSurprised  SpriteState = "surprised"
)

// Thresholds mirror DEFAULT_THRESHOLDS in frontend stateMapping.ts (S2-03).
type Thresholds struct {
	TalkJawOpen        float64
	Smile              float64
	SurpriseBrow       float64
	ThoughtfulBrowDown float64
	GazeDown           float64
}

// DefaultThresholds is the single source shared by both implementations
// (parity proven by the shared fixtures in testdata/state_parity.json).
var DefaultThresholds = Thresholds{
	TalkJawOpen:        0.25,
	Smile:              0.35,
	SurpriseBrow:       0.45,
	ThoughtfulBrowDown: 0.3,
	GazeDown:           0.3,
}

// MapBlendshapesToState applies the documented precedence:
// surprised > happy > thoughtful > talking > idle.
func MapBlendshapesToState(bs map[string]float64, th Thresholds) (SpriteState, error) {
	if bs == nil {
		return "", fmt.Errorf("nil blendshape record")
	}
	if v(bs["browInnerUp"]) >= th.SurpriseBrow {
		return StateSurprised, nil
	}
	if maxOf(v(bs["mouthSmileLeft"]), v(bs["mouthSmileRight"])) >= th.Smile {
		return StateHappy, nil
	}
	if maxOf(v(bs["browDownLeft"]), v(bs["browDownRight"])) >= th.ThoughtfulBrowDown ||
		maxOf(v(bs["eyeLookDownLeft"]), v(bs["eyeLookDownRight"])) >= th.GazeDown {
		return StateThoughtful, nil
	}
	if v(bs["jawOpen"]) >= th.TalkJawOpen {
		return StateTalking, nil
	}
	return StateIdle, nil
}

// BodyStates collapses per-sample states into delta windows.
type sample struct {
	T     int64              `json:"t"`
	BS    []float64          `json:"-"`
	Named map[string]float64 `json:"-"`
}

func maxOf(a, b float64) float64 {
	if b > a {
		return b
	}
	return a
}

func v(f float64) float64 { return f }

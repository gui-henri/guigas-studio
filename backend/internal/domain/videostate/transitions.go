package videostate

import (
	"errors"
	"fmt"
	"slices"
)

// ErrInvalidState is wrapped by Parse for unrecognized raw values.
var ErrInvalidState = errors.New("invalid video state")

// transitions encodes the canonical machine:
//   - the linear chain new → … → released;
//   - every state may become blocked (with a structured reason);
//   - blocked may resume to any state (whoever resumes decides where).
//
// Reverse re-approval edges (e.g. final_review → queued) are appended later
// by their own tasks (S5-07), never inline.
var transitions = map[State][]State{
	StateNew:            {StateScriptPending, StateBlocked},
	StateScriptPending:  {StateScriptReview, StateBlocked},
	StateScriptReview:   {StateScriptApproved, StateBlocked},
	StateScriptApproved: {StateRecording, StateBlocked},
	StateRecording:      {StateVoiceProcess, StateBlocked},
	StateVoiceProcess:   {StateScenesPending, StateBlocked},
	StateScenesPending:  {StateScenesReview, StateBlocked},
	StateScenesReview:   {StateQueued, StateBlocked},
	StateQueued:         {StateRendering, StateBlocked},
	StateRendering:      {StateFinalReview, StateBlocked},
	StateFinalReview:    {StateReleased, StateBlocked},
	StateReleased:       {StateBlocked},
	StateBlocked:        All(),
}

// All returns every valid state in canonical chain order, with blocked last.
func All() []State {
	return []State{
		StateNew,
		StateScriptPending,
		StateScriptReview,
		StateScriptApproved,
		StateRecording,
		StateVoiceProcess,
		StateScenesPending,
		StateScenesReview,
		StateQueued,
		StateRendering,
		StateFinalReview,
		StateReleased,
		StateBlocked,
	}
}

// Parse converts a raw string into a State, rejecting unknown values.
func Parse(raw string) (State, error) {
	s := State(raw)
	if !slices.Contains(All(), s) {
		return "", fmt.Errorf("%w: %q", ErrInvalidState, raw)
	}
	return s, nil
}

// Valid returns true when s is one of the 13 states.
func Valid(s State) bool {
	return slices.Contains(All(), s)
}

// CanTransition reports whether from→to is a legal edge.
func CanTransition(from, to State) bool {
	targets, ok := transitions[from]
	if !ok {
		return false
	}
	return slices.Contains(targets, to)
}

// Transition validates from→to and returns a typed *TransitionError when illegal.
func Transition(from, to State) error {
	if CanTransition(from, to) {
		return nil
	}
	return &TransitionError{From: from, To: to}
}

// TransitionError describes an illegal transition; safe for errors.As.
type TransitionError struct {
	From State
	To   State
}

func (e *TransitionError) Error() string {
	return fmt.Sprintf("illegal video transition %q -> %q", e.From, e.To)
}

package videostate

import (
	"errors"
	"slices"
	"strings"
	"testing"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
)

func TestAllMatchesCanonicalOrder(t *testing.T) {
	want := []State{
		StateNew, StateScriptPending, StateScriptReview, StateScriptApproved,
		StateRecording, StateVoiceProcess, StateScenesPending, StateScenesReview,
		StateQueued, StateRendering, StateFinalReview, StateReleased, StateBlocked,
	}
	got := All()
	if !slices.Equal(got, want) {
		t.Fatalf("All() = %v, want %v", got, want)
	}
}

// legal pairs pass: the chain edges + task-mandated reverse edges + every
// X→blocked + blocked→any.
func TestTransitionsExhaustive(t *testing.T) {
	// Task-mandated reverse edges (each added by its own task, never inline):
	reverseEdges := map[State]map[State]bool{
		StateScriptReview: {StateScriptPending: true}, // RejectScript (S1-04)
	}

	legal := make(map[[2]State]bool)
	all := All()
	for i := 0; i+1 < len(all)-1; i++ { // linear chain new → … → released
		legal[[2]State{all[i], all[i+1]}] = true
	}
	legal[[2]State{StateFinalReview, StateReleased}] = true // terminal edge (covered above, kept explicit)
	for _, s := range all {
		if s != StateBlocked {
			legal[[2]State{s, StateBlocked}] = true // anything can block
		}
		legal[[2]State{StateBlocked, s}] = true // blocked resumes anywhere
	}
	for from, targets := range reverseEdges {
		for to := range targets {
			legal[[2]State{from, to}] = true
		}
	}

	for _, from := range all {
		for _, to := range all {
			want := legal[[2]State{from, to}]
			if got := CanTransition(from, to); got != want {
				t.Errorf("CanTransition(%q,%q) = %v, want %v", from, to, got, want)
				continue
			}
			err := Transition(from, to)
			if want && err != nil {
				t.Errorf("Transition(%q,%q) unexpected error: %v", from, to, err)
			}
			if !want {
				var terr *TransitionError
				if err == nil || !errors.As(err, &terr) {
					t.Errorf("Transition(%q,%q) error = %v, want *TransitionError", from, to, err)
					continue
				}
				if terr.From != from || terr.To != to {
					t.Errorf("TransitionError{From:%q,To:%q} lost context (%q→%q)", terr.From, terr.To, from, to)
				}
			}
		}
	}
}

func TestRejectEdgeExplicit(t *testing.T) {
	if err := Transition(StateScriptReview, StateScriptPending); err != nil {
		t.Errorf("reject edge script_review→script_pending rejected: %v", err)
	}
}

func TestChainEdgesExplicitly(t *testing.T) {
	chain := []State{
		StateNew, StateScriptPending, StateScriptReview, StateScriptApproved,
		StateRecording, StateVoiceProcess, StateScenesPending, StateScenesReview,
		StateQueued, StateRendering, StateFinalReview, StateReleased,
	}
	for i := range len(chain) - 1 {
		if err := Transition(chain[i], chain[i+1]); err != nil {
			t.Errorf("chain edge %s → %s rejected: %v", chain[i], chain[i+1], err)
		}
	}
}

func TestParseValidAndGarbage(t *testing.T) {
	for _, s := range All() {
		got, err := Parse(string(s))
		if err != nil || got != s {
			t.Errorf("Parse(%q) = %q, %v; want %q", s, got, err, s)
		}
	}
	for _, garbage := range []string{"", "zzz", "NEW", "script pending", "Blocked"} {
		if _, err := Parse(garbage); !errors.Is(err, ErrInvalidState) {
			t.Errorf("Parse(%q) error = %v, want ErrInvalidState", garbage, err)
		}
	}
}

func TestValidRejectsUnknown(t *testing.T) {
	if Valid("zzz") {
		t.Error(`Valid("zzz") = true`)
	}
	if !Valid(StateQueued) {
		t.Error("Valid(queued) = false")
	}
}

// TestProtoSync guards against drift: proto enum value names without the
// VIDEO_STATUS_ prefix must equal the domain states exactly.
func TestProtoSync(t *testing.T) {
	protoStates := make(map[string]bool)
	for _, name := range studiov1.VideoStatus_name {
		norm := strings.ToLower(strings.TrimPrefix(name, "VIDEO_STATUS_"))
		if norm == "unspecified" {
			continue // proto3 requires the zero value; it is not a pipeline state
		}
		protoStates[norm] = true
	}
	for _, s := range All() {
		if !protoStates[string(s)] {
			t.Errorf("domain state %q has no proto counterpart", s)
		}
	}
	if len(protoStates) != len(All()) {
		t.Errorf("proto has %d values, domain has %d — drift detected", len(protoStates), len(All()))
	}
}

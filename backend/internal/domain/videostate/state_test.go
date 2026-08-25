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

// TestTransitionsExhaustive walks the full 13×13 matrix and asserts that only
// legal pairs pass: the 12 chain edges + every X→blocked + blocked→any.
func TestTransitionsExhaustive(t *testing.T) {
	all := All()
	for _, from := range all {
		for _, to := range all {
			want := false
			switch {
			case from == StateBlocked:
				want = true // resume anywhere, including re-blocking
			case from == to:
				want = false // no self-loops elsewhere
			case to == StateBlocked:
				want = true // anything can block
			case next(from) == to && to != StateReleased:
				want = true // linear chain edge
			case from == StateFinalReview && to == StateReleased:
				want = true // terminal edge
			}
			if got := CanTransition(from, to); got != want {
				t.Errorf("CanTransition(%q,%q) = %v, want %v", from, to, got, want)
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

// next returns the following state in the canonical chain (nil at the end).
func next(s State) State {
	all := All()
	if i := slices.Index(all, s); i >= 0 && i+1 < len(all) {
		return all[i+1]
	}
	return ""
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

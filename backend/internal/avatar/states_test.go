package avatar

import (
	"encoding/json"
	"os"
	"testing"
)

// TestStateMappingParityWithTS consumes the SAME fixture file as the vitest
// suite (frontend stateParity.test.ts) proving Go decides identically.
func TestStateMappingParityWithTS(t *testing.T) {
	raw, err := os.ReadFile("testdata/state_parity.json")
	if err != nil {
		t.Fatalf("fixture: %v", err)
	}
	var fixture struct {
		Cases []struct {
			Name     string             `json:"name"`
			Values   map[string]float64 `json:"values"`
			Expected string             `json:"expected"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}

	for _, tc := range fixture.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			got, err := MapBlendshapesToState(tc.Values, DefaultThresholds)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != tc.Expected {
				t.Errorf("got %q, want %q", got, tc.Expected)
			}
		})
	}
}

func TestNilRecordRejected(t *testing.T) {
	if _, err := MapBlendshapesToState(nil, DefaultThresholds); err == nil {
		t.Error("nil record must be rejected")
	}
}

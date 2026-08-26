package timeline

import (
	"encoding/json"
	"testing"

	"google.golang.org/protobuf/encoding/protojson"
)

func namedSample(t int64, values map[string]float64) NamedSample {
	return NamedSample{T: t, Values: values}
}

func TestBuildMergesSourcesAndInsertsSilence(t *testing.T) {
	in := BuildInput{
		SegmentID:  "seg-1",
		DurationMs: 2000,
		MouthCues: []MouthCueIn{
			{Shape: "A", StartMs: 100, EndMs: 400},
			{Shape: "B", StartMs: 600, EndMs: 900},
		},
		Samples: []NamedSample{
			namedSample(0, map[string]float64{"jawOpen": 0.0}),
			namedSample(500, map[string]float64{"jawOpen": 0.8}),
			namedSample(1500, map[string]float64{"jawOpen": 0.0}),
		},
		Words: []WordTimingIn{
			{Word: "olha", StartMs: 120, EndMs: 380},
		},
	}

	tl, err := Build(in)
	if err != nil {
		t.Fatalf("build: %v", err)
	}

	// Silence inserted before first cue, between cues and after the last.
	if len(tl.MouthCues) != 5 {
		t.Fatalf("mouth cues = %d (%+v), want 5 with X fillers", len(tl.MouthCues), tl.MouthCues)
	}
	if got := tl.MouthCues[0]; got.Shape != "X" || got.StartMs != 0 || got.EndMs != 100 {
		t.Errorf("leading silence = %+v", got)
	}
	if got := tl.MouthCues[2]; got.Shape != "X" || got.StartMs != 400 || got.EndMs != 600 {
		t.Errorf("mid silence = %+v", got)
	}
	if got := tl.MouthCues[4]; got.Shape != "X" || got.StartMs != 900 || got.EndMs != 2000 {
		t.Errorf("trailing silence = %+v", got)
	}

	// Body states collapsed into deltas: idle→talking→idle.
	if len(tl.BodyStates) != 3 {
		t.Fatalf("body states = %d, want 3 deltas", len(tl.BodyStates))
	}
	states := []string{tl.BodyStates[0].State, tl.BodyStates[1].State, tl.BodyStates[2].State}
	if states[0] != "idle" || states[1] != "talking" || states[2] != "idle" {
		t.Errorf("state sequence = %v", states)
	}
	if talk := tl.BodyStates[1]; talk.StartMs != 500 || talk.EndMs != 1500 {
		t.Errorf("talking window = %+v", talk)
	}

	// Word timings carried through.
	if len(tl.WordTimings) != 1 || tl.WordTimings[0].Word != "olha" {
		t.Errorf("word timings = %+v", tl.WordTimings)
	}

	// protojson round-trip gate (camelCase on disk per S3-04 note).
	body, mErr := protojson.MarshalOptions{}.Marshal(tl)
	if mErr != nil {
		t.Fatal(mErr)
	}
	if !contains(string(body), `"segmentId":"seg-1"`) {
		t.Errorf("expected camelCase protojson output, got: %s", body)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

func TestBuildRejectsOverlappingMouthCues(t *testing.T) {
	in := BuildInput{
		SegmentID:  "s",
		DurationMs: 1000,
		MouthCues: []MouthCueIn{
			{Shape: "A", StartMs: 100, EndMs: 500},
			{Shape: "B", StartMs: 400, EndMs: 800}, // overlaps
		},
	}
	if _, err := Build(in); err == nil {
		t.Error("overlapping cues accepted")
	}
}

func TestGoldenSerializedShape(t *testing.T) {
	in := BuildInput{
		SegmentID:  "g",
		DurationMs: 1000,
		MouthCues:  []MouthCueIn{{Shape: "B", StartMs: 0, EndMs: 1000}},
		Samples:    []NamedSample{namedSample(0, map[string]float64{})},
	}
	tl, err := Build(in)
	if err != nil {
		t.Fatal(err)
	}
	// NOTE: protojson omits zero-valued scalar fields (proto3 implicit presence)
	// and its spacing is not stable — hence the parsed-tree comparison.
	golden := []byte(`{"version":1,"segmentId":"g","durationMs":"1000","mouthCues":[{"shape":"B","endMs":"1000"}],"bodyStates":[{"state":"idle","endMs":"1000"}]}`)
	body, _ := protojson.MarshalOptions{}.Marshal(tl)
	// protojson output spacing is not guaranteed stable — compare parsed trees.
	var gotObj, wantObj any
	if err := json.Unmarshal(body, &gotObj); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(golden, &wantObj); err != nil {
		t.Fatal(err)
	}
	if !jsonEqual(gotObj, wantObj) {
		t.Errorf("golden mismatch:\n got %s\nwant %s", body, golden)
	}
}

func jsonEqual(a, b any) bool {
	ab, _ := json.Marshal(a)
	bb, _ := json.Marshal(b)
	return string(ab) == string(bb)
}

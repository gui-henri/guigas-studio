// Package timeline builds the per-segment avatar.timeline.json (S3-04):
// mouth cues (visemes) + body states (from recorded blendshapes, Go port of
// the S2-03 mapping) + word timings — protojson-validated before persisting.
package timeline

import (
	"fmt"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/gui-henri/guigas-studio/backend/internal/avatar"
)

// MouthCueIn is one viseme cue from the S3-03 sidecar.
type MouthCueIn struct {
	Shape   string `json:"shape"`
	StartMs int64  `json:"start_ms"`
	EndMs   int64  `json:"end_ms"`
}

// NamedSample is one blendshape row with model category names (S2-07 file).
type NamedSample struct {
	T      int64
	Values map[string]float64
}

// WordTimingIn is one aligned word (S3-02 output).
type WordTimingIn struct {
	Word    string
	StartMs int64
	EndMs   int64
}

// BuildInput aggregates everything the builder merges.
type BuildInput struct {
	SegmentID  string
	DurationMs int64
	MouthCues  []MouthCueIn
	Samples    []NamedSample
	Words      []WordTimingIn
}

// Build assembles and validates the timeline. A protojson round-trip gates
// every write: invalid structures never reach disk.
func Build(in BuildInput) (*studiov1.AvatarTimeline, error) {
	tl := &studiov1.AvatarTimeline{
		Version:    1,
		SegmentId:  in.SegmentID,
		DurationMs: in.DurationMs,
	}

	for _, mc := range in.MouthCues {
		if len(mc.Shape) != 1 {
			return nil, fmt.Errorf("mouth cue shape %q must be a single letter", mc.Shape)
		}
		tl.MouthCues = append(tl.MouthCues, &studiov1.TimelineMouthCue{
			Shape:   strings.ToUpper(mc.Shape),
			StartMs: mc.StartMs,
			EndMs:   mc.EndMs,
		})
	}
	if err := insertSilenceGaps(tl); err != nil {
		return nil, err
	}

	bodyStates, err := deriveBodyStates(in.Samples, in.DurationMs)
	if err != nil {
		return nil, err
	}
	tl.BodyStates = bodyStates

	for _, w := range in.Words {
		tl.WordTimings = append(tl.WordTimings, &studiov1.TimelineWordTiming{
			Word:    w.Word,
			StartMs: w.StartMs,
			EndMs:   w.EndMs,
		})
	}

	// Round-trip gate: serialize → parse → compare basic invariants.
	body, err := protojson.MarshalOptions{UseProtoNames: false}.Marshal(tl)
	if err != nil {
		return nil, fmt.Errorf("marshal timeline: %w", err)
	}
	back := &studiov1.AvatarTimeline{}
	roundTrip := protojson.UnmarshalOptions{DiscardUnknown: false}
	if err := roundTrip.Unmarshal(body, back); err != nil {
		return nil, fmt.Errorf("timeline round-trip failed: %w", err)
	}
	return tl, nil
}

// insertSilenceGaps fills gaps between cues with X (silence) so the rig never
// guesses what the mouth does between words.
func insertSilenceGaps(tl *studiov1.AvatarTimeline) error {
	if len(tl.MouthCues) == 0 {
		return nil
	}
	out := make([]*studiov1.TimelineMouthCue, 0, len(tl.MouthCues)*2)

	prevEnd := int64(0)
	first := tl.MouthCues[0]
	if first.StartMs > prevEnd {
		out = append(out, &studiov1.TimelineMouthCue{Shape: "X", StartMs: prevEnd, EndMs: first.StartMs})
	}
	out = append(out, first)
	prevEnd = first.EndMs

	for _, c := range tl.MouthCues[1:] {
		if c.StartMs < prevEnd {
			return fmt.Errorf("mouth cues overlap at %dms", c.StartMs)
		}
		if c.StartMs > prevEnd {
			out = append(out, &studiov1.TimelineMouthCue{Shape: "X", StartMs: prevEnd, EndMs: c.StartMs})
		}
		out = append(out, c)
		prevEnd = c.EndMs
	}

	// Trailing silence up to the declared duration.
	if tl.DurationMs > prevEnd {
		out = append(out, &studiov1.TimelineMouthCue{Shape: "X", StartMs: prevEnd, EndMs: tl.DurationMs})
	}
	tl.MouthCues = out
	return nil
}

// deriveBodyStates maps every sample through the Go port of the S2-03
// mapping and collapses consecutive equal states into delta windows.
func deriveBodyStates(samples []NamedSample, endAt int64) ([]*studiov1.TimelineBodyState, error) {
	var out []*studiov1.TimelineBodyState
	var current *studiov1.TimelineBodyState

	for _, s := range samples {
		state, err := avatar.MapBlendshapesToState(s.Values, avatar.DefaultThresholds)
		if err != nil {
			return nil, fmt.Errorf("sample @%dms: %w", s.T, err)
		}
		if current != nil && current.State == string(state) {
			continue
		}
		if current != nil {
			current.EndMs = s.T // close previous window where the new one begins
		}
		current = &studiov1.TimelineBodyState{
			State:   string(state),
			StartMs: s.T,
			EndMs:   s.T,
		}
		out = append(out, current)
	}
	if current != nil && current.EndMs < endAt {
		current.EndMs = endAt
	}
	return out, nil
}

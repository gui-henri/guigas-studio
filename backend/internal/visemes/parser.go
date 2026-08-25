package visemes

import (
	"encoding/json"
	"fmt"
	"math"
)

// rhubarbOutput mirrors the JSON Rhubarb Lip Sync emits on stdout:
// {"mouthCues":[{"start":0.00,"end":0.35,"value":"X"}, ...]} — seconds, floats.
type rhubarbOutput struct {
	MouthCues []struct {
		Start float64 `json:"start"`
		End   float64 `json:"end"`
		Value string  `json:"value"`
	} `json:"mouthCues"`
}

// ParseRhubarbJSON converts raw engine stdout into validated cues.
// Durations are clamped to wavDurationMs.
func ParseRhubarbJSON(data []byte, wavDurationMs int) ([]MouthCue, error) {
	var parsed rhubarbOutput
	if err := json.Unmarshal(data, &parsed); err != nil {
		return nil, fmt.Errorf("parse rhubarb json: %w", err)
	}
	cues := make([]MouthCue, 0, len(parsed.MouthCues))
	for _, mc := range parsed.MouthCues {
		if len(mc.Value) != 1 {
			return nil, fmt.Errorf("bad shape value %q", mc.Value)
		}
		start := int(math.Round(mc.Start * 1000))
		end := int(math.Round(mc.End * 1000))
		cues = append(cues, MouthCue{
			Shape:   mc.Value[0],
			StartMs: start,
			EndMs:   end,
		})
	}
	return Validate(cues, wavDurationMs)
}

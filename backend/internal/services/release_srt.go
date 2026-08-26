package services

import (
	"fmt"
	"strings"
)

// SRT conversion (S5-09 step 4) — pure, unit-tested. Consumes the cue
// contract produced by S3-05 (timelines/subtitles.en.json).

type SRTCue struct {
	StartMs int64
	EndMs   int64
	Text    string
}

// CuesToSRT renders cues as an SRT block with 1-based numbering.
func CuesToSRT(cues []SRTCue) string {
	var b strings.Builder
	for i, c := range cues {
		b.WriteString(fmt.Sprintf("%d\n", i+1))
		b.WriteString(fmt.Sprintf("%s --> %s\n", srtTime(c.StartMs), srtTime(c.EndMs)))
		b.WriteString(strings.TrimRight(c.Text, "\n"))
		b.WriteString("\n\n")
	}
	return b.String()
}

func srtTime(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	hours := ms / 3_600_000
	minutes := (ms % 3_600_000) / 60_000
	seconds := (ms % 60_000) / 1000
	millis := ms % 1000
	return fmt.Sprintf("%02d:%02d:%02d,%03d", hours, minutes, seconds, millis)
}

// ParseSubtitleTrackJSON decodes the S3-05 subtitles.en.json shape.
type SubtitleTrackJSON struct {
	Version   int32      `json:"version"`
	SegmentID string     `json:"segment_id"`
	Cues      []struct {
		StartMs int64  `json:"start_ms"`
		EndMs   int64  `json:"end_ms"`
		Text    string `json:"text"`
	} `json:"cues"`
}

func TrackToCues(track SubtitleTrackJSON) []SRTCue {
	out := make([]SRTCue, 0, len(track.Cues))
	for _, c := range track.Cues {
		out = append(out, SRTCue{StartMs: c.StartMs, EndMs: c.EndMs, Text: c.Text})
	}
	return out
}

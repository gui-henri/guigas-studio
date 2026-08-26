package services

import (
	"strings"
	"testing"
)

func TestCuesToSRT(t *testing.T) {
	cues := []SRTCue{
		{StartMs: 0, EndMs: 1800, Text: "What if your blog\npost became a video?"},
		{StartMs: 2100, EndMs: 34000, Text: "That is the point."},
	}
	srt := CuesToSRT(cues)

	want := "1\n00:00:00,000 --> 00:00:01,800\nWhat if your blog\npost became a video?\n\n" +
		"2\n00:00:02,100 --> 00:00:34,000\nThat is the point.\n\n"
	if srt != want {
		t.Fatalf("srt mismatch:\ngot:\n%s\nwant:\n%s", srt, want)
	}
}

func TestSRTTimeClampsNegative(t *testing.T) {
	srt := CuesToSRT([]SRTCue{{StartMs: -50, EndMs: 900, Text: "x"}})
	if !strings.HasPrefix(srt, "1\n00:00:00,000 --> 00:00:00,900") {
		t.Fatalf("negative ms not clamped: %s", srt)
	}
}

func TestFormatThread(t *testing.T) {
	out := formatThread([]string{"primeiro", "segundo"})
	if !strings.Contains(out, "1/2\nprimeiro") || !strings.Contains(out, "2/2\nsegundo") {
		t.Fatalf("thread formatting wrong: %q", out)
	}
}

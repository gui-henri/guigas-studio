// Package transcription defines the domain-facing contract for speech
// transcription. The local provider (backlog) plugs in here without touching
// callers — SPEC §8 #7.
package transcription

import "context"

// Word is one transcribed word with its time range inside the audio file.
type Word struct {
	Text    string
	StartMs int
	EndMs   int
}

// Result carries the transcript plus token usage reported by the provider.
type Result struct {
	Words []Word

	PromptTokens int
	OutputTokens int
}

// Transcriber converts a WAV file into timestamped words.
type Transcriber interface {
	Transcribe(ctx context.Context, wavPath string) (*Result, error)
}

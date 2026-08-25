// Package subtitles translates PT narrations to EN via Gemini (one request
// per segment, full-script context) and builds time-aligned cues.
package subtitles

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
)

// Generator produces text completions (the Gemini client satisfies this).
type Generator interface {
	Generate(ctx context.Context, prompt string) (string, error)
}

// SegmentInput is one narration to translate.
type SegmentInput struct {
	ID          string
	NarrationPt string
}

const promptTmpl = `Você é um tradutor PT-BR → EN para legendas de vídeo técnico.
Contexto: roteiro completo na ordem (para consistência de termos):
%s

Traduza a narração do segmento %q para inglês natural e conciso, dividindo em frases
curtas de legenda. Responda APENAS com JSON válido: ["frase 1", "frase 2"] sem texto fora do JSON.

Narração do segmento:
%s`

// TranslateSegment translates one narration and returns raw + parsed EN sentences.
func TranslateSegment(ctx context.Context, gen Generator, seg SegmentInput, allSegments []SegmentInput) (raw string, sentences []string, err error) {
	var ctxLines strings.Builder
	for _, s := range allSegments {
		fmt.Fprintf(&ctxLines, "- [%s] %s\n", s.ID, s.NarrationPt)
	}
	prompt := fmt.Sprintf(promptTmpl, ctxLines.String(), seg.ID, seg.NarrationPt)

	raw, err = gen.Generate(ctx, prompt)
	if err != nil {
		return "", nil, fmt.Errorf("generate translation for %s: %w", seg.ID, err)
	}
	sentences, err = parseSentences(raw)
	if err != nil {
		return raw, nil, fmt.Errorf("segment %s: %w", seg.ID, err)
	}
	return raw, sentences, nil
}

func parseSentences(text string) ([]string, error) {
	start := strings.IndexByte(text, '[')
	end := strings.LastIndexByte(text, ']')
	if start < 0 || end <= start {
		return nil, fmt.Errorf("model output has no JSON array")
	}
	var out []string
	if err := json.Unmarshal([]byte(text[start:end+1]), &out); err != nil {
		return nil, fmt.Errorf("not a valid sentence array: %w", err)
	}
	cleaned := make([]string, 0, len(out))
	for _, s := range out {
		if t := strings.TrimSpace(s); t != "" {
			cleaned = append(cleaned, t)
		}
	}
	if len(cleaned) == 0 {
		return nil, fmt.Errorf("empty sentence array")
	}
	return cleaned, nil
}

// BuildCues distributes EN sentences proportionally over the segment window.
// When word timings are available they bound the window more tightly; the
// proportional path is the documented fallback (S3-05 notes).
func BuildCues(segmentID string, sentences []string, segmentStartMs, segmentDurationMs int64) (*studiov1.SubtitleTrack, error) {
	if len(sentences) == 0 || segmentDurationMs <= 0 {
		return nil, fmt.Errorf("nothing to cue for %s", segmentID)
	}
	totalChars := 0
	weights := make([]int, len(sentences))
	for i, s := range sentences {
		weights[i] = len(s)
		totalChars += len(s)
	}

	track := &studiov1.SubtitleTrack{Version: 1, SegmentId: segmentID}
	cursor := segmentStartMs
	for i, s := range sentences {
		dur := int64(0)
		if i == len(sentences)-1 {
			dur = segmentStartMs + segmentDurationMs - cursor // last takes the remainder
		} else {
			dur = segmentDurationMs * int64(weights[i]) / int64(totalChars)
		}
		track.Cues = append(track.Cues, &studiov1.SubtitleCue{
			StartMs: cursor,
			EndMs:   cursor + dur,
			Text:    s,
		})
		cursor += dur
	}
	return track, nil
}

// ValidateTrack enforces ordering, no-overlap and in-bounds cues via protojson round-trip.
func ValidateTrack(track *studiov1.SubtitleTrack, segmentEndMs int64) error {
	var prevEnd int64 = -1
	for i, c := range track.GetCues() {
		if c.GetStartMs() < prevEnd || c.GetEndMs() < c.GetStartMs() {
			return fmt.Errorf("cue %d overlapping/invalid: %d..%d (prev end %d)", i, c.GetStartMs(), c.GetEndMs(), prevEnd)
		}
		prevEnd = c.GetEndMs()
	}
	if n := len(track.GetCues()); n > 0 && track.GetCues()[n-1].GetEndMs() > segmentEndMs {
		return fmt.Errorf("last cue exceeds segment end %d", segmentEndMs)
	}
	body, err := protojson.Marshal(track)
	if err != nil {
		return fmt.Errorf("protojson marshal: %w", err)
	}
	back := &studiov1.SubtitleTrack{}
	if err := protojson.Unmarshal(body, back); err != nil {
		return fmt.Errorf("protojson round-trip failed: %w", err)
	}
	return nil
}

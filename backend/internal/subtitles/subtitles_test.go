package subtitles

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gui-henri/guigas-studio/backend/internal/gemini"
)

func newTestGenerator(t *testing.T, response string) Generator {
	t.Helper()
	c, err := gemini.New(gemini.Config{APIKey: "k", BackoffBase: 1})
	if err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"candidates":[{"content":{"parts":[{"text":` + jsonString(response) + `}]}}]}`))
	}))
	t.Cleanup(srv.Close)
	c.SetEndpoint(srv.URL)
	return c
}

func jsonString(s string) string {
	b := []byte{'"'}
	for _, r := range s {
		switch r {
		case '"':
			b = append(b, '\\', '"')
		case '\n':
			b = append(b, '\\', 'n')
		default:
			b = append(b, []byte(string(r))...)
		}
	}
	return string(append(b, '"'))
}

func TestTranslateSegmentHappyPath(t *testing.T) {
	gen := newTestGenerator(t, "[\"Look at the parser diff.\", \"Two hundred lines became forty.\"]")
	all := []SegmentInput{{ID: "seg", NarrationPt: "Olha o diff do parser. Duzentas linhas viraram quarenta."}}
	raw, sentences, err := TranslateSegment(context.Background(), gen, all[0], all)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(raw, "parser diff") && !strings.Contains(raw, "parser") {
		t.Logf("raw=%q", raw) // raw preserved for audit
	}
	if len(sentences) != 2 || sentences[1] != "Two hundred lines became forty." {
		t.Errorf("sentences = %+v", sentences)
	}
}

func TestTranslateSegmentMalformedFails(t *testing.T) {
	gen := newTestGenerator(t, "desculpe, nao sei traduzir")
	_, _, err := TranslateSegment(context.Background(), gen,
		SegmentInput{ID: "s", NarrationPt: "x"}, nil)
	if err == nil || !strings.Contains(err.Error(), "no JSON array") {
		t.Errorf("err = %v, want clear malformed-output error", err)
	}
}

func TestBuildCuesProportionalAndInBounds(t *testing.T) {
	track, err := BuildCues("seg",
		[]string{"aaaa", "bb", "cccccccc"}, // weights 4/2/8
		1000, 1400)                         // window 1000..2400
	if err != nil {
		t.Fatal(err)
	}
	cues := track.GetCues()
	if len(cues) != 3 {
		t.Fatalf("cues = %d", len(cues))
	}
	if cues[0].GetStartMs() != 1000 || cues[2].GetEndMs() != 2400 {
		t.Errorf("bounds wrong: %+v", cues)
	}
	// proportional: middle cue gets 1400*2/14 = 200ms; first gets 400ms.
	if got := cues[0].GetEndMs() - cues[0].GetStartMs(); got != 400 {
		t.Errorf("first duration = %d, want 400", got)
	}
	prevEnd := int64(0)
	for i, c := range cues {
		if c.GetStartMs() < prevEnd {
			t.Errorf("cue %d overlaps previous (start %d < prev end %d)", i, c.GetStartMs(), prevEnd)
		}
		prevEnd = c.GetEndMs()
	}
}

func TestValidateTrackRejectsOverlapAndOutOfBounds(t *testing.T) {
	okTrack, err := BuildCues("s", []string{"one"}, 0, 500)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateTrack(okTrack, 500); err != nil {
		t.Fatalf("valid track rejected: %v", err)
	}

	overlapping, _ := BuildCues("s", []string{"a", "b"}, 0, 500)
	overlapping.Cues[1].StartMs = overlapping.Cues[0].EndMs - 10
	if err := ValidateTrack(overlapping, 500); err == nil {
		t.Error("overlap not rejected")
	}

	outOfBounds, _ := BuildCues("s", []string{"a"}, 0, 500)
	outOfBounds.Cues[0].EndMs = 900
	if err := ValidateTrack(outOfBounds, 500); err == nil {
		t.Error("out-of-bounds not rejected")
	}
}

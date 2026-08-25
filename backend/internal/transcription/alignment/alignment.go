// Package alignment matches an imperfect ASR transcript against the expected
// narration text and projects word timings onto the approved narration.
// Pure logic, zero I/O, fully deterministic (SPEC §3: the approved text is the
// source of truth; timestamps are render metadata).
package alignment

import (
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"

	"github.com/gui-henri/guigas-studio/backend/internal/transcription"
)

// WordTiming is a narration word with its projected time window.
type WordTiming struct {
	Word    string
	StartMs int
	EndMs   int
}

// AlignmentResult reports the projected timings plus quality signals.
type AlignmentResult struct {
	Timings []WordTiming
	// MatchRatio is matched-narration-words / total narration words (0..1).
	MatchRatio float64
	// Degenerate is true when MatchRatio fell below MinMatchRatio and the
	// raw transcript timings were returned instead of interpolated ones.
	Degenerate bool
}

// MinMatchRatio below which alignment is considered degenerate (S3-02).
const MinMatchRatio = 0.6

// NormalizeToken lowercases, strips punctuation and applies NFC Unicode
// normalization — accents are PRESERVED so "você" never matches "voce".
func NormalizeToken(s string) string {
	s = norm.NFC.String(s)
	var b strings.Builder
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(unicode.ToLower(r))
		default:
			// punctuation/space: token boundary, dropped inside tokens
		}
	}
	return b.String()
}

func tokenize(text string) []string {
	fields := strings.FieldsFunc(text, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		if t := NormalizeToken(f); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// opKind is one edit operation from the Levenshtein backtrace.
type opKind int

const (
	opMatch opKind = iota
	opSub
	opIns // only in narration (gap to interpolate)
	opDel // only in transcript (dropped)
)

// Align produces word timings for every narration word.
//
// Projection rules (S3-02):
//   - match/sub pairs copy the transcript timestamps (display text always
//     comes from the narration);
//   - narration-only gaps get linearly interpolated times between the
//     surrounding anchors;
//   - transcript-only words are discarded.
//
// When the match ratio falls below MinMatchRatio the result flags
// Degenerate and returns the RAW transcript timings instead — plausible
// timings are never invented.
func Align(narration string, words []transcription.Word) AlignmentResult {
	narrTokens := tokenize(narration)
	trTokens := make([]string, len(words))
	for i, w := range words {
		trTokens[i] = NormalizeToken(w.Text)
	}
	display := splitDisplayWords(narration)

	if len(narrTokens) == 0 || len(words) == 0 {
		return AlignmentResult{
			Timings:    rawTimings(words),
			MatchRatio: 0,
			Degenerate: true,
		}
	}

	ops, ratio := alignOps(narrTokens, trTokens)
	if ratio < MinMatchRatio {
		return AlignmentResult{
			Timings:    rawTimings(words),
			MatchRatio: ratio,
			Degenerate: true,
		}
	}

	timings := project(ops, narrTokens, display, words)
	return AlignmentResult{Timings: timings, MatchRatio: ratio}
}

// alignOps computes the edit script via word-level Levenshtein with backtrace.
func alignOps(narr, tr []string) ([]opKind, float64) {
	n, m := len(narr), len(tr)
	dp := make([][]int, n+1)
	for i := range dp {
		dp[i] = make([]int, m+1)
	}
	for i := 1; i <= n; i++ {
		dp[i][0] = i
	}
	for j := 1; j <= m; j++ {
		dp[0][j] = j
	}
	for i := 1; i <= n; i++ {
		for j := 1; j <= m; j++ {
			cost := 1
			if narr[i-1] == tr[j-1] {
				cost = 0
			}
			del := dp[i-1][j] + 1
			ins := dp[i][j-1] + 1
			sub := dp[i-1][j-1] + cost
			dp[i][j] = minInt(del, ins, sub)
		}
	}

	// Backtrace (reverse order build).
	ops := make([]opKind, 0, n+m)
	i, j := n, m
	for i > 0 || j > 0 {
		switch {
		case i > 0 && j > 0 && narr[i-1] == tr[j-1]:
			ops = append(ops, opMatch)
			i--
			j--
		case i > 0 && j > 0 && dp[i][j] == dp[i-1][j-1]+1:
			ops = append(ops, opSub)
			i--
			j--
		case i > 0 && dp[i][j] == dp[i-1][j]+1:
			ops = append(ops, opIns)
			i--
		default:
			ops = append(ops, opDel)
			j--
		}
	}
	// Reverse in place.
	for a, b := 0, len(ops)-1; a < b; a, b = a+1, b-1 {
		ops[a], ops[b] = ops[b], ops[a]
	}

	matches := 0
	for _, op := range ops {
		if op == opMatch {
			matches++
		}
	}
	ratio := float64(matches) / float64(n)
	return ops, ratio
}

// project walks the ops and emits one timing per narration word.
func project(ops []opKind, narrTokens, display []string, words []transcription.Word) []WordTiming {
	out := make([]WordTiming, 0, len(narrTokens))

	type anchor struct {
		index   int // index in out
		startMs int
		endMs   int
	}
	anchors := make([]anchor, 0)

	ni, ti := 0, 0
	for _, op := range ops {
		switch op {
		case opMatch, opSub:
			w := words[ti]
			out = append(out, WordTiming{Word: display[ni], StartMs: w.StartMs, EndMs: w.EndMs})
			anchors = append(anchors, anchor{index: len(out) - 1, startMs: w.StartMs, endMs: w.EndMs})
			ni++
			ti++
		case opIns:
			out = append(out, WordTiming{Word: display[ni], StartMs: -1, EndMs: -1})
			ni++
		case opDel:
			ti++
		}
	}

	// Interpolate gaps between surrounding anchors (or extend edges).
	prevEnd := 0
	nextStart := -1
	nextIdx := 0
	for idx := range out {
		if out[idx].StartMs >= 0 {
			prevEnd = out[idx].EndMs // anchor END bounds the following gap
			continue
		}
		// find next anchor after idx
		for nextIdx < len(anchors) && anchors[nextIdx].index <= idx {
			nextIdx++
		}
		if nextIdx < len(anchors) {
			nextStart = anchors[nextIdx].startMs
		} else {
			nextStart = prevEnd
		}
		// collect consecutive gap words starting at idx
		gapEnd := idx
		for gapEnd+1 < len(out) && out[gapEnd+1].StartMs < 0 {
			gapEnd++
		}
		count := gapEnd - idx + 2 // +1 slot for boundary
		slot := (nextStart - prevEnd) / count
		for k := idx; k <= gapEnd; k++ {
			start := prevEnd + slot*int(k-idx+1)
			out[k].StartMs = start
			out[k].EndMs = start + slot
		}
		idx = gapEnd
	}

	return out
}

func rawTimings(words []transcription.Word) []WordTiming {
	out := make([]WordTiming, 0, len(words))
	for _, w := range words {
		out = append(out, WordTiming{Word: w.Text, StartMs: w.StartMs, EndMs: w.EndMs})
	}
	return out
}

// splitDisplayWords keeps the original (punctuated) narration words for output.
func splitDisplayWords(narration string) []string {
	return strings.Fields(narration)
}

func minInt(vals ...int) int {
	m := vals[0]
	for _, v := range vals[1:] {
		if v < m {
			m = v
		}
	}
	return m
}

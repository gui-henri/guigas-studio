package watcher

import (
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/runes"
	"golang.org/x/text/transform"
	"golang.org/x/text/unicode/norm"
)

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

var deaccent = transform.Chain(norm.NFD, runes.Remove(runes.In(unicode.Mn)), norm.NFC)

// Slugify builds an ascii lowercase hyphenated slug from a link or title.
// Preference: the last meaningful URL path segment; fallback to the title.
func Slugify(link, title string) string {
	if s := slugFromLink(link); s != "" {
		return s
	}
	s := normalize(title)
	if s == "" {
		return "untitled"
	}
	return trimDashes(s)
}

func slugFromLink(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	if i := strings.IndexAny(raw, "?#"); i >= 0 {
		raw = raw[:i]
	}
	raw = strings.Trim(raw, "/")
	if raw == "" {
		return ""
	}

	var segments []string
	if _, rest, found := strings.Cut(raw, "/"); found {
		segments = strings.Split(rest, "/")
	} else {
		segments = []string{raw} // bare path or free text (title fallback)
	}

	for i := len(segments) - 1; i >= 0; i-- {
		s := normalize(segments[i])
		if s == "" || len(s) <= 2 || isAllDigits(s) {
			continue // skip year/month-ish and tiny segments
		}
		return trimDashes(s)
	}
	return ""
}

func normalize(s string) string {
	if ascii, _, err := transform.String(deaccent, s); err == nil {
		s = ascii
	}
	s = strings.ToLower(s)
	s = nonAlnum.ReplaceAllString(s, "-")
	return trimDashes(s)
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func trimDashes(s string) string {
	s = strings.Trim(s, "-")
	if len(s) > 80 {
		s = s[:80]
	}
	return s
}

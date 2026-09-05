package visemes

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// sidecar is the on-disk cache contract: audio/<segment-id>.visemes.json.
type sidecar struct {
	WavSha256 string     `json:"wav_sha256"`
	Cues      []MouthCue `json:"cues"`
}

// SidecarPath derives the standard on-disk cache path (audio/<segment-id>.visemes.json)
// from a WAV file path (audio/<segment-id>.wav).
func SidecarPath(wavPath string) string {
	return strings.TrimSuffix(wavPath, ".wav") + ".visemes.json"
}

// RecognizeWithCache runs engine.Recognize unless the sidecar cache already
// holds cues for the exact WAV checksum (re-recorded takes change the hash
// and invalidate naturally).
func RecognizeWithCache(
	ctx context.Context,
	engine Engine,
	wavPath string,
	dialogText string,
	wavDurationMs int,
) ([]MouthCue, error) {
	_ = dialogText
	sidecarPath := SidecarPath(wavPath)

	wavSum, err := FileSHA256(wavPath)
	if err != nil {
		return nil, fmt.Errorf("hash wav: %w", err)
	}

	if cached, ok := readSidecar(sidecarPath); ok && cached.WavSha256 == wavSum {
		slog.Debug("visemes.cache_hit", slog.String("wav", filepath.Base(wavPath)))
		return Validate(cached.Cues, wavDurationMs)
	}
	if cached, ok := readSidecar(wavPath + ".visemes.json"); ok && cached.WavSha256 == wavSum {
		slog.Debug("visemes.cache_hit_legacy", slog.String("wav", filepath.Base(wavPath)))
		return Validate(cached.Cues, wavDurationMs)
	}

	cues, err := engine.Recognize(ctx, wavPath)
	if err != nil {
		return nil, err
	}
	cues, err = Validate(cues, wavDurationMs)
	if err != nil {
		return nil, err
	}

	body, err := json.MarshalIndent(sidecar{WavSha256: wavSum, Cues: cues}, "", "  ")
	if err == nil {
		if werr := os.WriteFile(sidecarPath, append(body, '\n'), 0o644); werr != nil {
			slog.Warn("visemes.cache_write_failed", slog.Any("error", werr))
		}
	}
	return cues, nil
}

func readSidecar(path string) (sidecar, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return sidecar{}, false
	}
	var sc sidecar
	if json.Unmarshal(raw, &sc) != nil || sc.WavSha256 == "" {
		return sidecar{}, false
	}
	return sc, true
}

// FileSHA256 computes the sha256 hex digest of a file.
func FileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func fileSHA256(path string) (string, error) {
	return FileSHA256(path)
}

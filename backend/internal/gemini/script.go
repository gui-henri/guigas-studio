// Package gemini script generation: structured StudioScript output.
//
// Uses the Gemini GenerateContent REST API with responseMimeType
// application/json plus a responseSchema mirror of
// backend/internal/artifacts/schemas/studio_script.schema.json
// (subset accepted by the API: no $ref / additionalProperties / pattern).
package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// ScriptModel resolves GEMINI_SCRIPT_MODEL > GEMINI_MODEL > defaultModel.
func (c Config) scriptModel() string {
	if c.ScriptModel != "" {
		return c.ScriptModel
	}
	return c.model()
}

// ScriptTimeout resolves GEMINI_SCRIPT_TIMEOUT > Timeout > defaultTimeout.
func (c Config) scriptTimeout() time.Duration {
	if c.ScriptTimeout > 0 {
		return c.ScriptTimeout
	}
	if c.Timeout > 0 {
		return c.Timeout
	}
	return defaultTimeout
}

// NewFromEnvScript reads GEMINI_SCRIPT_MODEL / GEMINI_SCRIPT_TIMEOUT on top
// of the base NewFromEnv variables. Returns the same client type so the
// transcription contract keeps working.
func NewFromEnvScript() (*Client, error) {
	c, err := NewFromEnv()
	if err != nil {
		return nil, err
	}
	if m := os.Getenv("GEMINI_SCRIPT_MODEL"); m != "" {
		c.cfg.ScriptModel = m
	}
	if raw := os.Getenv("GEMINI_SCRIPT_TIMEOUT"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			c.cfg.ScriptTimeout = time.Duration(parsed) * time.Second
			c.http = &http.Client{Timeout: c.cfg.ScriptTimeout}
		}
	}
	return c, nil
}

type generationConfig struct {
	ResponseMimeType string          `json:"responseMimeType,omitempty"`
	ResponseSchema   json.RawMessage `json:"responseSchema,omitempty"`
}

type scriptRequest struct {
	Contents         []content       `json:"contents"`
	GenerationConfig *generationConfig `json:"generationConfig,omitempty"`
}

// GenerateScript sends prompt and forces a JSON object shaped by
// responseSchema. Reuses the retry/backoff policy of Generate.
func (c *Client) GenerateScript(ctx context.Context, prompt string, responseSchema []byte) (string, error) {
	var schema json.RawMessage
	if len(responseSchema) > 0 {
		if !json.Valid(responseSchema) {
			return "", fmt.Errorf("invalid response schema")
		}
		schema = responseSchema
	}
	payload, err := json.Marshal(scriptRequest{
		Contents: []content{{Parts: []part{{Text: prompt}}}},
		GenerationConfig: &generationConfig{
			ResponseMimeType: "application/json",
			ResponseSchema:   schema,
		},
	})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	// Script calls may need a longer deadline than transcription.
	timeout := c.cfg.scriptTimeout()
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			delay := c.cfg.backoffBase() << (attempt - 1)
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(delay):
			}
		}
		resp, retryable, callErr := c.generateScriptOnce(ctx, payload)
		if callErr == nil {
			return resp, nil
		}
		lastErr = callErr
		if !retryable {
			return "", callErr
		}
		slog.Warn("gemini.script.retry",
			slog.Int("attempt", attempt+1), slog.Any("error", callErr))
	}
	return "", fmt.Errorf("gemini script: exhausted %d attempts: %w", maxAttempts, lastErr)
}

func (c *Client) generateScriptOnce(ctx context.Context, payload []byte) (string, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.scriptEndpoint(), bytes.NewReader(payload))
	if err != nil {
		return "", false, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", true, fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return "", true, fmt.Errorf("read body: %w", err)
	}

	switch {
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return "", true, fmt.Errorf("upstream %d: %s", resp.StatusCode, truncate(raw, 200))
	case resp.StatusCode >= 400:
		return "", false, fmt.Errorf("client error %d: %s", resp.StatusCode, truncate(raw, 200))
	case resp.StatusCode != http.StatusOK:
		return "", true, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var parsed generateResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", false, fmt.Errorf("parse response: %w", err)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return "", false, fmt.Errorf("empty candidates")
	}

	slog.Info("gemini.script.usage",
		slog.String("model", c.cfg.scriptModel()),
		slog.Int("prompt_tokens", parsed.UsageMetadata.PromptTokenCount),
		slog.Int("output_tokens", parsed.UsageMetadata.CandidatesTokenCount))

	text := stripFences(parsed.Candidates[0].Content.Parts[0].Text)
	if !json.Valid([]byte(text)) {
		return "", false, fmt.Errorf("model did not return valid JSON")
	}
	return text, false, nil
}

func (c *Client) scriptEndpoint() string {
	// Same URL shape as New(), but with the script model override.
	base := c.endpoint()
	if c.cfg.ScriptModel == "" || c.cfg.ScriptModel == c.cfg.Model {
		return base
	}
	return strings.Replace(base, "/models/"+c.cfg.model()+":", "/models/"+c.cfg.scriptModel()+":", 1)
}

// stripFences removes wrapping ```json fences some models add despite
// responseMimeType application/json.
func stripFences(s string) string {
	t := strings.TrimSpace(s)
	if strings.HasPrefix(t, "```") {
		t = strings.TrimPrefix(t, "```")
		t = strings.TrimPrefix(t, "json")
		t = strings.TrimPrefix(t, "JSON")
		if i := strings.LastIndex(t, "```"); i >= 0 {
			t = t[:i]
		}
	}
	return strings.TrimSpace(t)
}

// Package gemini implements the transcription.Transcriber contract against
// the Gemini GenerateContent REST API (Flash Lite by default).
package gemini

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gui-henri/guigas-studio/backend/internal/transcription"
)

const (
	defaultModel       = "gemini-2.5-flash-lite"
	defaultTimeout     = 60 * time.Second
	maxAttempts        = 3
	defaultBackoffBase = 500 * time.Millisecond
)

// Config controls the Gemini client.
type Config struct {
	APIKey string
	Model  string
	// Timeout bounds a single HTTP request.
	Timeout time.Duration
	// ScriptModel overrides Model for structured script generation
	// (GEMINI_SCRIPT_MODEL). Empty falls back to Model.
	ScriptModel string
	// ScriptTimeout bounds a script generation request
	// (GEMINI_SCRIPT_TIMEOUT, seconds). Zero falls back to Timeout.
	ScriptTimeout time.Duration
	// BackoffBase is the initial retry delay; doubles each attempt.
	// Exposed for deterministic tests (default 500ms).
	BackoffBase time.Duration
}

func (c Config) model() string {
	if c.Model != "" {
		return c.Model
	}
	return defaultModel
}

func (c Config) backoffBase() time.Duration {
	if c.BackoffBase > 0 {
		return c.BackoffBase
	}
	return defaultBackoffBase
}

// Client implements transcription.Transcriber.
type Client struct {
	cfg      Config
	http     *http.Client
	endpoint func() string // overridable for tests
}

// New builds a client from explicit config; APIKey must be set.
func New(cfg Config) (*Client, error) {
	if cfg.APIKey == "" {
		return nil, errors.New("gemini: GEMINI_API_KEY is required")
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = defaultTimeout
	}
	c := &Client{cfg: cfg}
	c.http = &http.Client{Timeout: cfg.Timeout}
	c.endpoint = func() string {
		return fmt.Sprintf(
			"https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s",
			c.cfg.model(), cfg.APIKey,
		)
	}
	return c, nil
}

// NewFromEnv reads GEMINI_API_KEY / GEMINI_MODEL / GEMINI_TIMEOUT(s).
func NewFromEnv() (*Client, error) {
	timeout := defaultTimeout
	if raw := os.Getenv("GEMINI_TIMEOUT"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			timeout = time.Duration(parsed) * time.Second
		}
	}
	return New(Config{
		APIKey:  os.Getenv("GEMINI_API_KEY"),
		Model:   os.Getenv("GEMINI_MODEL"),
		Timeout: timeout,
	})
}

// SetEndpoint overrides the upstream URL (tests).
func (c *Client) SetEndpoint(url string) { c.endpoint = func() string { return url } }

// wire types ---------------------------------------------------------------

type generateRequest struct {
	Contents []content `json:"contents"`
}

type content struct {
	Parts []part `json:"parts"`
}

type part struct {
	Text       string     `json:"text,omitempty"`
	InlineData *inlineRef `json:"inlineData,omitempty"`
}

type inlineRef struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type generateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
	} `json:"usageMetadata"`
	Error *apiError `json:"error,omitempty"`
}

type apiError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type wordsPayload struct {
	Words []struct {
		Text    string `json:"text"`
		StartMs int    `json:"start_ms"`
		EndMs   int    `json:"end_ms"`
	} `json:"words"`
}

const promptTmpl = "Transcreva o áudio em português palavra por palavra. Responda APENAS com JSON válido no formato {\"words\":[{\"text\":\"...\",\"start_ms\":0,\"end_ms\":0}]} com timestamps em milissegundos desde o início do áudio, sem texto fora do JSON."

// Transcribe implements transcription.Transcriber. Retries only transient
// failures (429/5xx/network); 4xx payload errors fail fast.
func (c *Client) Transcribe(ctx context.Context, wavPath string) (*transcription.Result, error) {
	rawWav, err := os.ReadFile(wavPath)
	if err != nil {
		return nil, fmt.Errorf("read wav: %w", err)
	}

	payload, err := json.Marshal(generateRequest{
		Contents: []content{{
			Parts: []part{
				{Text: promptTmpl},
				{InlineData: &inlineRef{
					MimeType: "audio/wav",
					Data:     base64.StdEncoding.EncodeToString(rawWav),
				}},
			},
		}},
	})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			delay := c.cfg.backoffBase() << (attempt - 1)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
		}

		result, retryable, callErr := c.callOnce(ctx, payload)
		if callErr == nil {
			return result, nil
		}
		lastErr = callErr
		if !retryable {
			return nil, callErr
		}
		slog.Warn("gemini.retry",
			slog.Int("attempt", attempt+1), slog.Any("error", callErr))
	}
	return nil, fmt.Errorf("gemini: exhausted %d attempts: %w", maxAttempts, lastErr)
}

func (c *Client) callOnce(ctx context.Context, payload []byte) (*transcription.Result, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint(), bytes.NewReader(payload))
	if err != nil {
		return nil, false, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, true, fmt.Errorf("network: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, true, fmt.Errorf("read body: %w", err)
	}

	switch {
	case resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500:
		return nil, true, fmt.Errorf("upstream %d: %s", resp.StatusCode, truncate(raw, 200))
	case resp.StatusCode >= 400:
		var errResp generateResponse
		if json.Unmarshal(raw, &errResp) == nil && errResp.Error != nil {
			return nil, false, fmt.Errorf("api error %d: %s", errResp.Error.Code, errResp.Error.Message)
		}
		return nil, false, fmt.Errorf("client error %d: %s", resp.StatusCode, truncate(raw, 200))
	case resp.StatusCode != http.StatusOK:
		return nil, true, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var parsed generateResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, false, fmt.Errorf("parse response: %w", err)
	}
	if len(parsed.Candidates) == 0 || len(parsed.Candidates[0].Content.Parts) == 0 {
		return nil, false, errors.New("empty candidates")
	}

	words, err := parseWordsJSON(parsed.Candidates[0].Content.Parts[0].Text)
	if err != nil {
		return nil, false, err
	}

	slog.Info("gemini.usage",
		slog.String("model", c.cfg.model()),
		slog.Int("prompt_tokens", parsed.UsageMetadata.PromptTokenCount),
		slog.Int("output_tokens", parsed.UsageMetadata.CandidatesTokenCount))

	return &transcription.Result{
		Words:        words,
		PromptTokens: parsed.UsageMetadata.PromptTokenCount,
		OutputTokens: parsed.UsageMetadata.CandidatesTokenCount,
	}, false, nil
}

// parseWordsJSON tolerates markdown fences some models add around JSON.
func parseWordsJSON(text string) ([]transcription.Word, error) {
	cleaned := text[strings.IndexByte(text, '{'):]
	if end := strings.LastIndexByte(cleaned, '}'); end >= 0 {
		cleaned = cleaned[:end+1]
	}
	cleaned = strings.ReplaceAll(cleaned, "```json", "")
	cleaned = strings.ReplaceAll(cleaned, "```", "")

	var payload wordsPayload
	if err := json.Unmarshal([]byte(cleaned), &payload); err != nil {
		return nil, fmt.Errorf("model output is not valid words JSON: %w", err)
	}
	words := make([]transcription.Word, 0, len(payload.Words))
	for _, w := range payload.Words {
		words = append(words, transcription.Word{
			Text: w.Text, StartMs: w.StartMs, EndMs: w.EndMs,
		})
	}
	return words, nil
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "…"
}

// Generate sends a text-only prompt and returns the model's first part text.
// Same retry/backoff/usage logging as Transcribe (S3-01 machinery reused).
func (c *Client) Generate(ctx context.Context, prompt string) (string, error) {
	payload, err := json.Marshal(generateRequest{
		Contents: []content{{Parts: []part{{Text: prompt}}}},
	})
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

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

		resp, retryable, callErr := c.generateOnce(ctx, payload)
		if callErr == nil {
			return resp, nil
		}
		lastErr = callErr
		if !retryable {
			return "", callErr
		}
		slog.Warn("gemini.retry",
			slog.Int("attempt", attempt+1), slog.Any("error", callErr))
	}
	return "", fmt.Errorf("gemini: exhausted %d attempts: %w", maxAttempts, lastErr)
}

func (c *Client) generateOnce(ctx context.Context, payload []byte) (string, bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.endpoint(), bytes.NewReader(payload))
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
		return "", false, errors.New("empty candidates")
	}

	slog.Info("gemini.usage",
		slog.String("model", c.cfg.model()),
		slog.Int("prompt_tokens", parsed.UsageMetadata.PromptTokenCount),
		slog.Int("output_tokens", parsed.UsageMetadata.CandidatesTokenCount))

	return parsed.Candidates[0].Content.Parts[0].Text, false, nil
}

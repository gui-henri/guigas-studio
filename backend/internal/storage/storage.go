// Package storage abstracts binary object storage behind one interface.
//
// Text (script.json, timelines, context) stays on local disk + git.
// Binaries (audio/*.wav, renders/*.mp4, assets) move to S3-compatible
// storage (Cloudflare R2 in prod, MinIO locally). Keys mirror the
// current relative paths: videos/<slug>/audio/<file>, etc.
package storage

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"
)

// ObjectInfo describes a stored object.
type ObjectInfo struct {
	Key         string
	Size        int64
	ETag        string
	SHA256      string
	ContentType string
	ModTime     time.Time
}

// ListItem is a single entry of a prefix listing.
type ListItem struct {
	Key  string
	Size int64
}

// Storage is the binary backend contract. LocalStorage implements it
// today; S3Storage (R2/MinIO) implements it once S3_* env is set.
type Storage interface {
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) (ObjectInfo, error)
	Get(ctx context.Context, key string) (io.ReadCloser, ObjectInfo, error)
	GetRange(ctx context.Context, key string, offset, length int64) (io.ReadCloser, ObjectInfo, error)
	Stat(ctx context.Context, key string) (ObjectInfo, error)
	List(ctx context.Context, prefix string, maxKeys int) ([]ListItem, string, error)
	Delete(ctx context.Context, key string) error
	DeletePrefix(ctx context.Context, prefix string) error
	PresignedGet(ctx context.Context, key string, ttl time.Duration) (string, error)
	PresignedPut(ctx context.Context, key string, ttl time.Duration, contentType string, contentLength int64) (string, error)
}

// Key helpers keep S3 keys identical to today's relative paths.
func KeyForTake(slug, segmentID, kind string) string {
	ext := "wav"
	if kind == "blendshapes" {
		ext = "blendshapes.json"
	}
	return fmt.Sprintf("videos/%s/audio/%s.%s", slug, segmentID, ext)
}

func KeyForRender(slug, file string) string {
	return fmt.Sprintf("videos/%s/renders/%s", slug, file)
}

func KeyForAsset(slug, rel string) string {
	rel = strings.TrimPrefix(rel, "/")
	return fmt.Sprintf("videos/%s/assets/%s", slug, rel)
}

// ValidateKey rejects traversal and enforces the allow-listed prefixes.
func ValidateKey(key string) error {
	if key == "" || strings.HasPrefix(key, "/") || strings.Contains(key, "..") || strings.Contains(key, "\\") || strings.Contains(key, "//") {
		return fmt.Errorf("invalid key %q", key)
	}
	if !strings.HasPrefix(key, "videos/") {
		return fmt.Errorf("key %q outside videos/ prefix", key)
	}
	return nil
}

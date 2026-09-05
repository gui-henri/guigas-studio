package storage

import (
	"context"
	"fmt"

	"github.com/gui-henri/guigas-studio/backend/internal/config"
)

// NewFromConfig builds the binary backend from server config: R2 (S3Storage)
// when S3_ENABLED=true, local disk (LocalStorage) otherwise. Text
// (script.json, timelines, context) always stays on local disk + git.
func NewFromConfig(ctx context.Context, cfg config.Config) (Storage, error) {
	if !cfg.S3.Enabled {
		return NewLocalStorage(cfg.DataDir), nil
	}
	if cfg.S3.Bucket == "" || cfg.S3.Endpoint == "" || cfg.S3.AccessKey == "" || cfg.S3.SecretKey == "" {
		return nil, fmt.Errorf("storage: S3_ENABLED=true requires S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY and S3_SECRET_KEY")
	}
	return NewS3Storage(ctx,
		cfg.S3.Bucket, cfg.S3.Endpoint, cfg.S3.Region,
		cfg.S3.AccessKey, cfg.S3.SecretKey,
		cfg.S3.ForcePathStyle, cfg.S3.PublicURL,
	)
}

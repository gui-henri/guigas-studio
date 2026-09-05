package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// S3Storage implements Storage on top of S3-compatible object storage.
// Production target is Cloudflare R2 (endpoint
// https://<accountid>.r2.cloudflarestorage.com, region "auto").
// No MinIO layer: tests use LocalStorage, staging/prod use R2 directly.
type S3Storage struct {
	client    *s3.Client
	presigner *s3.PresignClient
	bucket    string
	publicURL string
}

// NewS3Storage builds an S3-backed store. endpoint is the R2 base URL
// (https://<accountid>.r2.cloudflarestorage.com); region is "auto" for R2.
// forcePathStyle stays false for R2 (virtual-hosted style).
func NewS3Storage(ctx context.Context, bucket, endpoint, region, accessKey, secretKey string, forcePathStyle bool, publicURL string) (*S3Storage, error) {
	if bucket == "" || endpoint == "" || accessKey == "" || secretKey == "" {
		return nil, fmt.Errorf("s3: bucket, endpoint, access key and secret key are required")
	}
	if region == "" {
		region = "auto"
	}
	awsCfg, err := awscfg.LoadDefaultConfig(ctx,
		awscfg.WithRegion(region),
		awscfg.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		awscfg.WithBaseEndpoint(endpoint),
	)
	if err != nil {
		return nil, fmt.Errorf("s3: load config: %w", err)
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = forcePathStyle
	})
	return &S3Storage{
		client:    client,
		presigner: s3.NewPresignClient(client),
		bucket:    bucket,
		publicURL: strings.TrimSuffix(publicURL, "/"),
	}, nil
}

func (s *S3Storage) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) (ObjectInfo, error) {
	if err := ValidateKey(key); err != nil {
		return ObjectInfo{}, err
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	h := sha256.New()
	tee := io.TeeReader(body, h)
	in := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        tee,
		ContentType: aws.String(contentType),
	}
	if size >= 0 {
		in.ContentLength = aws.Int64(size)
	}
	out, err := s.client.PutObject(ctx, in)
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("s3 put %q: %w", key, err)
	}
	return ObjectInfo{
		Key:         key,
		Size:        size,
		ETag:        strings.Trim(aws.ToString(out.ETag), `"`),
		SHA256:      hex.EncodeToString(h.Sum(nil)),
		ContentType: contentType,
		ModTime:     time.Now(),
	}, nil
}

func (s *S3Storage) Get(ctx context.Context, key string) (io.ReadCloser, ObjectInfo, error) {
	return s.GetRange(ctx, key, 0, -1)
}

func (s *S3Storage) GetRange(ctx context.Context, key string, offset, length int64) (io.ReadCloser, ObjectInfo, error) {
	if err := ValidateKey(key); err != nil {
		return nil, ObjectInfo{}, err
	}
	in := &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}
	if offset > 0 || length >= 0 {
		var r string
		if length >= 0 {
			r = fmt.Sprintf("bytes=%d-%d", offset, offset+length-1)
		} else {
			r = fmt.Sprintf("bytes=%d-", offset)
		}
		in.Range = aws.String(r)
	}
	out, err := s.client.GetObject(ctx, in)
	if err != nil {
		return nil, ObjectInfo{}, fmt.Errorf("s3 get %q: %w", key, err)
	}
	return out.Body, ObjectInfo{
		Key:         key,
		Size:        aws.ToInt64(out.ContentLength),
		ETag:        strings.Trim(aws.ToString(out.ETag), `"`),
		ContentType: aws.ToString(out.ContentType),
		ModTime:     aws.ToTime(out.LastModified),
	}, nil
}

func (s *S3Storage) Stat(ctx context.Context, key string) (ObjectInfo, error) {
	if err := ValidateKey(key); err != nil {
		return ObjectInfo{}, err
	}
	out, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("s3 stat %q: %w", key, err)
	}
	sha := ""
	if v := out.Metadata["sha256"]; v != "" {
		sha = v
	}
	return ObjectInfo{
		Key:         key,
		Size:        aws.ToInt64(out.ContentLength),
		ETag:        strings.Trim(aws.ToString(out.ETag), `"`),
		SHA256:      sha,
		ContentType: aws.ToString(out.ContentType),
		ModTime:     aws.ToTime(out.LastModified),
	}, nil
}

func (s *S3Storage) List(ctx context.Context, prefix string, maxKeys int) ([]ListItem, string, error) {
	if strings.Contains(prefix, "..") {
		return nil, "", fmt.Errorf("invalid prefix %q", prefix)
	}
	var token *string
	var out []ListItem
	for {
		n := int32(1000)
		if maxKeys > 0 && int32(len(out)) < int32(maxKeys) && int32(maxKeys)-int32(len(out)) < n {
			n = int32(maxKeys) - int32(len(out))
		}
		res, err := s.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket:            aws.String(s.bucket),
			Prefix:            aws.String(prefix),
			MaxKeys:           aws.Int32(n),
			ContinuationToken: token,
		})
		if err != nil {
			return nil, "", fmt.Errorf("s3 list %q: %w", prefix, err)
		}
		for _, o := range res.Contents {
			out = append(out, ListItem{Key: aws.ToString(o.Key), Size: aws.ToInt64(o.Size)})
			if maxKeys > 0 && len(out) >= maxKeys {
				return out, aws.ToString(res.NextContinuationToken), nil
			}
		}
		if !aws.ToBool(res.IsTruncated) {
			return out, "", nil
		}
		token = res.NextContinuationToken
	}
}

func (s *S3Storage) Delete(ctx context.Context, key string) error {
	if err := ValidateKey(key); err != nil {
		return err
	}
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("s3 delete %q: %w", key, err)
	}
	return nil
}

func (s *S3Storage) DeletePrefix(ctx context.Context, prefix string) error {
	if strings.Contains(prefix, "..") {
		return fmt.Errorf("invalid prefix %q", prefix)
	}
	for {
		items, token, err := s.List(ctx, prefix, 1000)
		if err != nil {
			return err
		}
		if len(items) == 0 {
			return nil
		}
		ids := make([]types.ObjectIdentifier, 0, len(items))
		for _, it := range items {
			ids = append(ids, types.ObjectIdentifier{Key: aws.String(it.Key)})
		}
		_, err = s.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(s.bucket),
			Delete: &types.Delete{Objects: ids},
		})
		if err != nil {
			return fmt.Errorf("s3 delete-prefix %q: %w", prefix, err)
		}
		if token == "" {
			return nil
		}
	}
}

func (s *S3Storage) PresignedGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	req, err := s.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}, func(o *s3.PresignOptions) {
		o.Expires = ttl
	})
	if err != nil {
		return "", fmt.Errorf("s3 presign-get %q: %w", key, err)
	}
	return s.rewriteURL(req.URL), nil
}

func (s *S3Storage) PresignedPut(ctx context.Context, key string, ttl time.Duration, contentType string, contentLength int64) (string, error) {
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	if ttl <= 0 {
		ttl = 15 * time.Minute
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	in := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	}
	if contentLength >= 0 {
		in.ContentLength = aws.Int64(contentLength)
	}
	req, err := s.presigner.PresignPutObject(ctx, in, func(o *s3.PresignOptions) {
		o.Expires = ttl
	})
	if err != nil {
		return "", fmt.Errorf("s3 presign-put %q: %w", key, err)
	}
	return s.rewriteURL(req.URL), nil
}

// rewriteURL swaps the endpoint host for the configured public URL
// (custom CDN domain in front of R2), preserving path + query (signature).
func (s *S3Storage) rewriteURL(raw string) string {
	if s.publicURL == "" {
		return raw
	}
	if i := strings.Index(raw, "://"); i >= 0 {
		if j := strings.Index(raw[i+3:], "/"); j >= 0 {
			return s.publicURL + raw[i+3+j:]
		}
	}
	return raw
}

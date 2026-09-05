package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// LocalStorage implements Storage on top of the current DATA_DIR layout.
// It is the default (S3_ENABLED=false) and the parity target for tests.
type LocalStorage struct {
	root string
}

// NewLocalStorage builds a file-backed store rooted at dataDir.
func NewLocalStorage(dataDir string) *LocalStorage {
	return &LocalStorage{root: dataDir}
}

func (l *LocalStorage) fullPath(key string) (string, error) {
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	return filepath.Join(l.root, filepath.FromSlash(key)), nil
}

func (l *LocalStorage) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) (ObjectInfo, error) {
	p, err := l.fullPath(key)
	if err != nil {
		return ObjectInfo{}, err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return ObjectInfo{}, err
	}
	tmp := p + ".part"
	f, err := os.Create(tmp)
	if err != nil {
		return ObjectInfo{}, err
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), io.LimitReader(body, size+1))
	cerr := f.Close()
	if err != nil {
		_ = os.Remove(tmp)
		return ObjectInfo{}, err
	}
	if cerr != nil {
		_ = os.Remove(tmp)
		return ObjectInfo{}, cerr
	}
	if size >= 0 && n != size {
		_ = os.Remove(tmp)
		return ObjectInfo{}, fmt.Errorf("short write: got %d want %d", n, size)
	}
	if err := os.Rename(tmp, p); err != nil {
		return ObjectInfo{}, err
	}
	st, _ := os.Stat(p)
	return ObjectInfo{Key: key, Size: st.Size(), SHA256: hex.EncodeToString(h.Sum(nil)), ContentType: contentType, ModTime: st.ModTime()}, nil
}

func (l *LocalStorage) Get(ctx context.Context, key string) (io.ReadCloser, ObjectInfo, error) {
	return l.GetRange(ctx, key, 0, -1)
}

func (l *LocalStorage) GetRange(ctx context.Context, key string, offset, length int64) (io.ReadCloser, ObjectInfo, error) {
	p, err := l.fullPath(key)
	if err != nil {
		return nil, ObjectInfo{}, err
	}
	f, err := os.Open(p)
	if err != nil {
		return nil, ObjectInfo{}, err
	}
	st, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, ObjectInfo{}, err
	}
	if offset > 0 {
		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			_ = f.Close()
			return nil, ObjectInfo{}, err
		}
	}
	var r io.Reader = f
	if length >= 0 {
		r = io.LimitReader(f, length)
	}
	return struct {
		io.Reader
		io.Closer
	}{Reader: r, Closer: f}, ObjectInfo{Key: key, Size: st.Size(), ModTime: st.ModTime()}, nil
}

func (l *LocalStorage) Stat(ctx context.Context, key string) (ObjectInfo, error) {
	p, err := l.fullPath(key)
	if err != nil {
		return ObjectInfo{}, err
	}
	st, err := os.Stat(p)
	if err != nil {
		return ObjectInfo{}, err
	}
	return ObjectInfo{Key: key, Size: st.Size(), ModTime: st.ModTime()}, nil
}

func (l *LocalStorage) List(ctx context.Context, prefix string, maxKeys int) ([]ListItem, string, error) {
	if strings.Contains(prefix, "..") {
		return nil, "", fmt.Errorf("invalid prefix %q", prefix)
	}
	base := filepath.Join(l.root, filepath.FromSlash(prefix))
	var out []ListItem
	_ = filepath.Walk(base, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, _ := filepath.Rel(l.root, p)
		out = append(out, ListItem{Key: filepath.ToSlash(rel), Size: info.Size()})
		if maxKeys > 0 && len(out) >= maxKeys {
			return io.EOF
		}
		return nil
	})
	return out, "", nil
}

func (l *LocalStorage) Delete(ctx context.Context, key string) error {
	p, err := l.fullPath(key)
	if err != nil {
		return err
	}
	return os.Remove(p)
}

func (l *LocalStorage) DeletePrefix(ctx context.Context, prefix string) error {
	if strings.Contains(prefix, "..") {
		return fmt.Errorf("invalid prefix %q", prefix)
	}
	return os.RemoveAll(filepath.Join(l.root, filepath.FromSlash(prefix)))
}

func (l *LocalStorage) PresignedGet(ctx context.Context, key string, ttl time.Duration) (string, error) {
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	return fmt.Sprintf("/api/v1/storage/%s", key), nil
}

func (l *LocalStorage) PresignedPut(ctx context.Context, key string, ttl time.Duration, contentType string, contentLength int64) (string, error) {
	if err := ValidateKey(key); err != nil {
		return "", err
	}
	return fmt.Sprintf("/api/v1/storage/%s", key), nil
}

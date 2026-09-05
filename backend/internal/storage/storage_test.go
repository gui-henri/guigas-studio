package storage

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestValidateKey(t *testing.T) {
	valid := []string{
		"videos/slug/audio/seg.wav",
		"videos/slug/renders/long.mp4",
		"videos/slug/assets/img.png",
	}
	for _, k := range valid {
		if err := ValidateKey(k); err != nil {
			t.Errorf("ValidateKey(%q) = %v, want nil", k, err)
		}
	}
	invalid := []string{
		"",
		"/videos/slug/audio/x.wav",
		"videos/../etc/passwd",
		`videos\slug\audio\x.wav`,
		"videos//slug/audio/x.wav",
		"other/slug/audio/x.wav",
		"script.json",
	}
	for _, k := range invalid {
		if err := ValidateKey(k); err == nil {
			t.Errorf("ValidateKey(%q) = nil, want error", k)
		}
	}
}

func TestKeyHelpers(t *testing.T) {
	if got := KeyForTake("slug", "seg1", "audio"); got != "videos/slug/audio/seg1.wav" {
		t.Errorf("KeyForTake audio = %q", got)
	}
	if got := KeyForTake("slug", "seg1", "blendshapes"); got != "videos/slug/audio/seg1.blendshapes.json" {
		t.Errorf("KeyForTake blendshapes = %q", got)
	}
	if got := KeyForRender("slug", "long.mp4"); got != "videos/slug/renders/long.mp4" {
		t.Errorf("KeyForRender = %q", got)
	}
	if got := KeyForAsset("slug", "/img.png"); got != "videos/slug/assets/img.png" {
		t.Errorf("KeyForAsset = %q", got)
	}
}

func TestLocalStorageRoundtrip(t *testing.T) {
	ctx := context.Background()
	store := NewLocalStorage(t.TempDir())

	key := KeyForTake("slug", "seg1", "audio")
	body := "fake-wav-bytes"
	info, err := store.Put(ctx, key, strings.NewReader(body), int64(len(body)), "audio/wav")
	if err != nil {
		t.Fatalf("Put = %v", err)
	}
	if info.Size != int64(len(body)) || info.SHA256 == "" {
		t.Errorf("Put info = %+v, want size+sha", info)
	}

	st, err := store.Stat(ctx, key)
	if err != nil {
		t.Fatalf("Stat = %v", err)
	}
	if st.Size != int64(len(body)) {
		t.Errorf("Stat size = %d", st.Size)
	}

	rc, _, err := store.GetRange(ctx, key, 5, 3)
	if err != nil {
		t.Fatalf("GetRange = %v", err)
	}
	buf := make([]byte, 3)
	if _, err := rc.Read(buf); err != nil && len(buf) == 0 {
		t.Fatalf("Read = %v", err)
	}
	_ = rc.Close()
	if string(buf) != body[5:8] {
		t.Errorf("GetRange bytes = %q", buf)
	}

	items, _, err := store.List(ctx, "videos/slug/", 10)
	if err != nil || len(items) != 1 {
		t.Fatalf("List = %v, %d items", err, len(items))
	}

	url, err := store.PresignedGet(ctx, key, time.Minute)
	if err != nil || url == "" {
		t.Errorf("PresignedGet = %q, %v", url, err)
	}

	if err := store.Delete(ctx, key); err != nil {
		t.Fatalf("Delete = %v", err)
	}
	if _, err := store.Stat(ctx, key); err == nil {
		t.Errorf("Stat after Delete = nil, want error")
	}
}

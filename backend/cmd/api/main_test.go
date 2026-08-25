package main

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gui-henri/guigas-studio/backend/internal/config"
	"github.com/gui-henri/guigas-studio/backend/internal/database"
)

func TestHealthRoute(t *testing.T) {
	srv := httptest.NewServer(newHandler(config.Config{}, &database.DB{}, nil))
	defer srv.Close()

	resp, err := srv.Client().Post(srv.URL+"/app.studio.v1.HealthService/Check", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

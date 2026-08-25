package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/gui-henri/guigas-studio/backend/internal/auth"
)

const (
	testSecret    = "secret-secret-secret-secret"
	testRunnerPAT = "runner-pat-runner-pat"
	privateProc   = "/test.v1.Private/Do"
	publicLogin   = "/app.studio.v1.AuthService/Login"
	publicHealth  = "/app.studio.v1.HealthService/Check"
)

// newProtectedServer mounts one private procedure behind the interceptor.
func newProtectedServer(t *testing.T, runnerToken string) *httptest.Server {
	t.Helper()
	interceptor := NewAuthInterceptor(func(raw string) (*auth.Claims, error) {
		return auth.ParseToken(testSecret, raw)
	}, runnerToken)

	handler := connect.NewUnaryHandler(privateProc,
		func(ctx context.Context, req *connect.Request[studiov1.CheckRequest]) (*connect.Response[studiov1.CheckResponse], error) {
			return connect.NewResponse(&studiov1.CheckResponse{Status: "ok"}), nil
		},
		connect.WithInterceptors(interceptor))

	mux := http.NewServeMux()
	mux.Handle(privateProc, handler)
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func callPrivate(t *testing.T, srv *httptest.Server, authorization string) int {
	t.Helper()
	req, _ := http.NewRequest("POST", srv.URL+privateProc, strings.NewReader("{}"))
	req.Header.Set("Content-Type", "application/json")
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	}
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	defer resp.Body.Close()
	return resp.StatusCode
}

func validJWT(t *testing.T) string {
	t.Helper()
	token, _, err := auth.IssueToken(testSecret, "user-1", time.Hour)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	return token
}

func TestAuthInterceptorMatrix(t *testing.T) {
	srv := newProtectedServer(t, testRunnerPAT)

	cases := []struct {
		name          string
		authorization string
		wantStatus    int
	}{
		{"no token rejected", "", http.StatusUnauthorized},
		{"valid jwt accepted", "Bearer " + validJWT(t), http.StatusOK},
		{"expired jwt rejected", "Bearer " + mustExpiredJWT(t), http.StatusUnauthorized},
		{"tampered jwt rejected", "Bearer " + tamper(validJWT(t)), http.StatusUnauthorized},
		{"correct pat accepted", "Bearer " + testRunnerPAT, http.StatusOK},
		{"wrong pat rejected", "Bearer wrong-pat", http.StatusUnauthorized},
		{"non-bearer scheme rejected", "Basic dXNlcjpwYXNz", http.StatusUnauthorized},
		{"empty bearer rejected", "Bearer ", http.StatusUnauthorized},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := callPrivate(t, srv, tc.authorization)
			if got != tc.wantStatus {
				t.Errorf("status = %d, want %d (authorization=%q)", got, tc.wantStatus, tc.authorization)
			}
		})
	}
}

func TestPublicProceduresWhitelist(t *testing.T) {
	if _, ok := PublicProcedures[publicHealth]; !ok {
		t.Error("health check must be public")
	}
	if _, ok := PublicProcedures[publicLogin]; !ok {
		t.Error("login must be public")
	}
	if _, ok := PublicProcedures[privateProc]; ok {
		t.Errorf("private procedure %s must not be whitelisted", privateProc)
	}
}

func TestEmptyRunnerTokenDisablesPAT(t *testing.T) {
	srv := newProtectedServer(t, "")
	if got := callPrivate(t, srv, "Bearer "+testRunnerPAT); got != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401 with PAT support disabled", got)
	}
}

func mustExpiredJWT(t *testing.T) string {
	t.Helper()
	token, _, err := auth.IssueToken(testSecret, "user-1", -time.Minute)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	return token
}

func tamper(token string) string {
	if len(token) < 8 {
		return token + "xx"
	}
	return token[:len(token)-4] + "xxxx"
}

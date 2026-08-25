// Package middleware provides Connect interceptors shared by all handlers.
package middleware

import (
	"context"
	"crypto/subtle"
	"errors"
	"strings"

	"connectrpc.com/connect"

	"github.com/gui-henri/guigas-studio/backend/internal/auth"
)

// PublicProcedures are reachable without an Authorization header.
// Whitelisting is by exact procedure full name — never by prefix — so new
// services start protected by default.
var PublicProcedures = map[string]struct{}{
	"/app.studio.v1.AuthService/Login":   {},
	"/app.studio.v1.HealthService/Check": {},
}

const bearerPrefix = "Bearer "

// VerifyToken validates a raw bearer token and returns its claims.
type VerifyToken func(raw string) (*auth.Claims, error)

// NewAuthInterceptor returns a Connect unary interceptor that guards every
// non-whitelisted procedure with either a valid user JWT or the runner PAT
// (compared in constant time).
func NewAuthInterceptor(verifyToken VerifyToken, runnerToken string) connect.Interceptor {
	return connect.UnaryInterceptorFunc(func(next connect.UnaryFunc) connect.UnaryFunc {
		return connect.UnaryFunc(func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if _, isPublic := PublicProcedures[req.Spec().Procedure]; !isPublic {
				if !authorized(req.Header().Get("Authorization"), verifyToken, runnerToken) {
					return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("missing or invalid bearer token"))
				}
			}
			return next(ctx, req)
		})
	})
}

func authorized(authorization string, verifyToken VerifyToken, runnerToken string) bool {
	if !strings.HasPrefix(authorization, bearerPrefix) {
		return false
	}
	raw := strings.TrimSpace(strings.TrimPrefix(authorization, bearerPrefix))
	if raw == "" {
		return false
	}
	if _, err := verifyToken(raw); err == nil {
		return true
	}
	if runnerToken != "" && subtle.ConstantTimeCompare([]byte(raw), []byte(runnerToken)) == 1 {
		return true
	}
	return false
}

package auth

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// DefaultTTL is the session token lifetime (D-04/S0-07 note).
const DefaultTTL = 12 * time.Hour

// Claims carried by Studio session tokens.
type Claims struct {
	UserID string `json:"uid,omitempty"`
	jwt.RegisteredClaims
}

// claimsKey is the context key for authenticated user claims.
type claimsKey struct{}

// WithClaims stores authenticated claims in ctx (used by the auth interceptor).
func WithClaims(ctx context.Context, claims *Claims) context.Context {
	return context.WithValue(ctx, claimsKey{}, claims)
}

// ActorFromContext returns the acting identity: the JWT subject, "runner" for
// PAT requests, or "anonymous" when nothing is present (public procedures).
func ActorFromContext(ctx context.Context) string {
	if claims, ok := ctx.Value(claimsKey{}).(*Claims); ok && claims != nil {
		if claims.UserID != "" {
			return claims.UserID
		}
		if claims.Subject != "" {
			return claims.Subject
		}
	}
	return "runner"
}

// IssueToken signs a HS256 JWT for the user with the given TTL.
func IssueToken(secret, userID string, ttl time.Duration) (token string, expiresAt time.Time, err error) {
	if ttl == 0 {
		ttl = DefaultTTL
	}
	now := time.Now()
	expiresAt = now.Add(ttl)
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token, err = jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

// ErrInvalidToken is returned when a token fails signature or validation.
var ErrInvalidToken = errors.New("invalid or expired token")

// ParseToken validates signature (HS256 only) and expiry, returning the claims.
func ParseToken(secret, raw string) (*Claims, error) {
	parsed, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok || t.Header["alg"] != "HS256" {
			return nil, ErrInvalidToken
		}
		return []byte(secret), nil
	}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
	if err != nil || !parsed.Valid {
		return nil, ErrInvalidToken
	}
	claims, ok := parsed.Claims.(*Claims)
	if !ok || claims.ExpiresAt == nil || claims.ExpiresAt.Time.Before(time.Now()) {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

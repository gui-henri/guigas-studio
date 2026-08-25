package services

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"connectrpc.com/connect"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	studiov1connect "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1/studiov1connect"
	"github.com/gui-henri/guigas-studio/backend/internal/auth"
	sqlc "github.com/gui-henri/guigas-studio/backend/internal/database/sqlc"
)

// errInvalidCredentials is the only error Login ever reports (no enumeration).
var errInvalidCredentials = connect.NewError(connect.CodeUnauthenticated, errors.New("invalid credentials"))

// AuthService implements studio.v1.AuthService for the single seeded account.
type AuthService struct {
	queries   *sqlc.Queries
	jwtSecret string
}

// NewAuthService returns the Connect handler for AuthService.
func NewAuthService(pool *pgxpool.Pool, jwtSecret string) studiov1connect.AuthServiceHandler {
	return &AuthService{queries: sqlc.New(pool), jwtSecret: jwtSecret}
}

// Login validates credentials and issues a HS256 session token.
func (s *AuthService) Login(
	ctx context.Context,
	req *connect.Request[studiov1.LoginRequest],
) (*connect.Response[studiov1.LoginResponse], error) {
	user, err := s.queries.GetUserByUsername(ctx, req.Msg.GetUsername())
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("login lookup failed", "error", err)
		}
		return nil, errInvalidCredentials
	}
	ok, err := auth.VerifyPassword(req.Msg.GetPassword(), user.PasswordHash)
	if err != nil || !ok {
		return nil, errInvalidCredentials
	}
	token, expiresAt, err := auth.IssueToken(s.jwtSecret, user.ID.String(), auth.DefaultTTL)
	if err != nil {
		slog.Error("token issue failed", "error", err)
		return nil, connect.NewError(connect.CodeInternal, errors.New("failed to issue token"))
	}
	return connect.NewResponse(&studiov1.LoginResponse{
		Token:     token,
		ExpiresAt: expiresAt.Format(time.RFC3339),
	}), nil
}

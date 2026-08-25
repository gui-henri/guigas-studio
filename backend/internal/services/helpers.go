package services

import (
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// helpers shared by service implementations.

var errNoRows = pgx.ErrNoRows

func parseUUID(raw string) (uuid.UUID, error) {
	return uuid.Parse(raw)
}

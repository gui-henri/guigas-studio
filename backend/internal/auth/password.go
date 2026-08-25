// Package auth implements password verification and JWT issuing/parsing.
package auth

import (
	"github.com/alexedwards/argon2id"
)

// VerifyPassword compares a plaintext password against an argon2id encoded hash.
func VerifyPassword(password, hash string) (bool, error) {
	return argon2id.ComparePasswordAndHash(password, hash)
}

// HashPassword produces an argon2id encoded hash with default params.
func HashPassword(password string) (string, error) {
	return argon2id.CreateHash(password, argon2id.DefaultParams)
}

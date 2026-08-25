package auth

import (
	"testing"
	"time"
)

func TestIssueAndParseTokenRoundtrip(t *testing.T) {
	token, exp, err := IssueToken("secret-secret-secret-secret", "user-1", time.Hour)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if !exp.After(time.Now()) {
		t.Errorf("expiry %v should be in the future", exp)
	}
	claims, err := ParseToken("secret-secret-secret-secret", token)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if claims.UserID != "user-1" {
		t.Errorf("uid = %q, want %q", claims.UserID, "user-1")
	}
}

func TestParseTokenExpired(t *testing.T) {
	token, _, err := IssueToken("secret-secret-secret-secret", "user-1", -time.Minute)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if _, err := ParseToken("secret-secret-secret-secret", token); err != ErrInvalidToken {
		t.Fatalf("err = %v, want ErrInvalidToken", err)
	}
}

func TestParseTokenWrongSignature(t *testing.T) {
	token, _, err := IssueToken("secret-A-secret-A-secret-A", "user-1", time.Hour)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if _, err := ParseToken("secret-B-secret-B-secret-B", token); err != ErrInvalidToken {
		t.Fatalf("err = %v, want ErrInvalidToken", err)
	}
}

func TestParseTokenTampered(t *testing.T) {
	token, _, _ := IssueToken("secret-secret-secret-secret", "user-1", time.Hour)
	tampered := token[:len(token)-2] + "xx"
	if _, err := ParseToken("secret-secret-secret-secret", tampered); err != ErrInvalidToken {
		t.Fatalf("err = %v, want ErrInvalidToken", err)
	}
}

func TestVerifyPassword(t *testing.T) {
	hash, err := HashPassword("s3cret!")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	ok, err := VerifyPassword("s3cret!", hash)
	if err != nil || !ok {
		t.Errorf("correct password verify = (%v, %v), want (true, nil)", ok, err)
	}
	ok, err = VerifyPassword("wrong", hash)
	if err != nil || ok {
		t.Errorf("wrong password verify = (%v, %v), want (false, nil)", ok, err)
	}
}

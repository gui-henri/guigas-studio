// Command studio-hashpassword reads a password from stdin and prints the
// argon2id encoded hash to stdout, ready for STUDIO_PASSWORD_HASH.
package main

import (
	"fmt"
	"io"
	"os"

	"github.com/alexedwards/argon2id"
)

func main() {
	password, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read stdin:", err)
		os.Exit(1)
	}
	for len(password) > 0 && (password[len(password)-1] == '\n' || password[len(password)-1] == '\r') {
		password = password[:len(password)-1]
	}
	if len(password) == 0 {
		fmt.Fprintln(os.Stderr, "empty password")
		os.Exit(1)
	}
	hash, err := argon2id.CreateHash(string(password), argon2id.DefaultParams)
	if err != nil {
		fmt.Fprintln(os.Stderr, "hash password:", err)
		os.Exit(1)
	}
	fmt.Println(hash)
}

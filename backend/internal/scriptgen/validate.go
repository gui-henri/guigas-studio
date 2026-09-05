package scriptgen

import (
	"os"
	"strconv"

	"github.com/gui-henri/guigas-studio/backend/internal/artifacts"
)

// ValidateFunc adapts artifacts.ValidateScript to the Validator signature
// (human-readable messages for prompt feedback).
func ValidateFunc() Validator {
	return func(data []byte) []string {
		_, errs := artifacts.ValidateScript(data)
		msgs := make([]string, 0, len(errs))
		for _, e := range errs {
			msgs = append(msgs, e.Error())
		}
		return msgs
	}
}

// MaxAttemptsFromEnv reads SCRIPTGEN_MAX_ATTEMPTS, falling back to def
// when unset or invalid. The retry loop is bounded in all cases (>= 1).
func MaxAttemptsFromEnv(def int) int {
	if def < 1 {
		def = 1
	}
	raw := os.Getenv("SCRIPTGEN_MAX_ATTEMPTS")
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return def
	}
	return n
}

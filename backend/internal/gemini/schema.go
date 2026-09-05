package gemini

import (
	_ "embed"
)

//go:embed script_schema.json
var scriptSchemaJSON []byte

// ScriptResponseSchema returns the Gemini-safe responseSchema for
// structured script generation (mirror of the artifacts schema).
func ScriptResponseSchema() []byte {
	out := make([]byte, len(scriptSchemaJSON))
	copy(out, scriptSchemaJSON)
	return out
}

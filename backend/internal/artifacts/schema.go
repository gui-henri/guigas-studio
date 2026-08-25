// Package artifacts holds FS-facing contracts (JSON schemas) and validators
// for files written by external agents (D-01: JSON Schema + strict protojson,
// never Zod).
package artifacts

import (
	"embed"
)

//go:embed schemas/*.json
var schemas embed.FS

// StudioScriptSchema returns the embedded studio_script.schema.json bytes.
func StudioScriptSchema() ([]byte, error) {
	return schemas.ReadFile("schemas/studio_script.schema.json")
}

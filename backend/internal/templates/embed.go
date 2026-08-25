// Package templates holds versioned context-pack templates embedded in the binary.
package templates

import (
	"embed"
)

//go:embed agents.md method/*.md
var files embed.FS

// Agents returns the AGENTS.md content for video workspaces.
func Agents() []byte {
	return mustRead("agents.md")
}

// MethodBeat returns the beats method doc.
func MethodBeat() []byte {
	return mustRead("method/beats.md")
}

// MethodShorts returns the shorts marking method doc.
func MethodShorts() []byte {
	return mustRead("method/shorts.md")
}

func mustRead(name string) []byte {
	b, err := files.ReadFile(name)
	if err != nil {
		panic("templates: missing embedded file " + name + ": " + err.Error())
	}
	return b
}

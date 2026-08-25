package events

import (
	"strings"

	"google.golang.org/protobuf/encoding/protojson"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
)

// marshalSSE renders an event as an SSE data frame in protojson.
func marshalSSE(evt *studiov1.StudioEvent) (string, error) {
	body, err := protojson.MarshalOptions{}.Marshal(evt)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("event: studio\n")
	b.WriteString("data: ")
	b.WriteString(string(body))
	b.WriteString("\n\n")
	return b.String(), nil
}

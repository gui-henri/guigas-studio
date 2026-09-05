package events

import (
	"strconv"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"
)

// marshalSSE renders a delivery as an SSE frame in protojson, carrying the
// hub sequence as the SSE `id:` field for Last-Event-ID resume.
func marshalSSE(d Delivery) (string, error) {
	body, err := protojson.MarshalOptions{}.Marshal(d.Event)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("id: ")
	b.WriteString(strconv.FormatUint(d.Seq, 10))
	b.WriteString("\nevent: studio\n")
	b.WriteString("data: ")
	b.WriteString(string(body))
	b.WriteString("\n\n")
	return b.String(), nil
}

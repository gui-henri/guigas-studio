package artifacts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

// ValidateScript validates raw script.json bytes against the embedded JSON
// Schema and strict protojson, then applies relational rules the schema
// cannot express. It returns the parsed script plus all violations found.
func ValidateScript(data []byte) (*studiov1.StudioScript, []error) {
	var errs []error

	schemaBytes, err := StudioScriptSchema()
	if err != nil {
		return nil, []error{fmt.Errorf("load schema: %w", err)}
	}
	schemaDoc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schemaBytes))
	if err != nil {
		return nil, []error{fmt.Errorf("parse schema: %w", err)}
	}
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource("studio_script.json", schemaDoc); err != nil {
		return nil, []error{fmt.Errorf("register schema: %w", err)}
	}
	schema, err := compiler.Compile("studio_script.json")
	if err != nil {
		return nil, []error{fmt.Errorf("compile schema: %w", err)}
	}
	var doc any
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, []error{fmt.Errorf("invalid JSON: %w", err)}
	}
	if vErrs := schema.Validate(doc); vErrs != nil {
		errs = append(errs, fmt.Errorf("schema validation failed: %w", vErrs))
	}

	script := &studiov1.StudioScript{}
	opts := protojson.UnmarshalOptions{DiscardUnknown: false}
	if err := opts.Unmarshal(data, script); err != nil {
		errs = append(errs, fmt.Errorf("protojson strict: %w", err))
		return script, errs // relational rules need a parse; skip when unparseable
	}

	errs = append(errs, relationalRules(script)...)
	return script, errs
}

// relationalRules covers what JSON Schema cannot: unique segment ids and
// sequential auto-contained shorts (1..N in order of appearance).
func relationalRules(s *studiov1.StudioScript) []error {
	var errs []error

	seen := make(map[string]int, len(s.GetSegments()))
	for i, seg := range s.GetSegments() {
		id := seg.GetId()
		if prev, dup := seen[id]; dup {
			errs = append(errs, fmt.Errorf("segment %d: duplicate id %q (first used at index %d)", i, id, prev))
			continue
		}
		seen[id] = i
	}

	expect := uint32(1)
	for _, seg := range s.GetSegments() {
		marker := seg.GetShort()
		if marker == nil {
			continue
		}
		if marker.GetId() != expect {
			errs = append(errs, fmt.Errorf(
				"segment %q: short id %d out of sequence, want %d (shorts must be 1..N in order)",
				seg.GetId(), marker.GetId(), expect))
		}
		if strings.TrimSpace(marker.GetHook()) == "" || strings.TrimSpace(marker.GetCta()) == "" {
			errs = append(errs, fmt.Errorf("segment %q: short must be self-contained (hook and cta required)", seg.GetId()))
		}
		expect++
	}
	return errs
}

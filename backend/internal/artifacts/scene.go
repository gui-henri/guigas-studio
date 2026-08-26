package artifacts

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/santhosh-tekuri/jsonschema/v6/kind"
)

// SceneIssue is one structured violation for the conversational loop: the
// OpenCode agent reads .validation-latest.json and fixes exactly this prop.
type SceneIssue struct {
	SegmentID string `json:"segment_id"`
	Path      string `json:"path"`
	Message   string `json:"message"`
}

// ScenePropsSchema returns the embedded scene grammar JSON Schema (generated
// from remotion-kit/src/scenes/schema.ts by `npm run scenes:schema`).
func ScenePropsSchema() ([]byte, error) {
	return schemas.ReadFile("schemas/scene_props.schema.json")
}

// sceneSchemaDoc is a flat view of a proto SceneRef: {"type", "props"}.
type sceneSchemaDoc struct {
	Type  string         `json:"type"`
	Props map[string]any `json:"props"`
}

// compiledSceneSchemas compiles ONE schema per scene type instead of the raw
// anyOf union — validating the matching branch directly yields precise,
// single-branch error paths (no discriminator noise from sibling branches).
var compiledSceneSchemas = sync.OnceValues(func() (map[string]*jsonschema.Schema, error) {
	schemaBytes, err := ScenePropsSchema()
	if err != nil {
		return nil, fmt.Errorf("load schema: %w", err)
	}
	rawDoc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schemaBytes))
	if err != nil {
		return nil, fmt.Errorf("parse schema: %w", err)
	}
	root, ok := rawDoc.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("unexpected schema root")
	}

	// Generated schema shape: {$ref: "#/definitions/StudioScene",
	// definitions: {StudioScene: {anyOf: [...]}}}. Resolve the ref.
	definitions, _ := root["definitions"].(map[string]any)
	union, ok := definitions["StudioScene"].(map[string]any)
	if !ok {
		return nil, fmt.Errorf("schema missing definitions.StudioScene")
	}
	branches, ok := union["anyOf"].([]any)
	if !ok {
		return nil, fmt.Errorf("schema has no anyOf union")
	}

	byType := make(map[string]*jsonschema.Schema, len(branches))
	for i, branchRaw := range branches {
		branch, ok := branchRaw.(map[string]any)
		if !ok {
			continue
		}
		props, _ := branch["properties"].(map[string]any)
		typeSpec, _ := props["type"].(map[string]any)
		sceneType, _ := typeSpec["const"].(string)
		if sceneType == "" {
			continue
		}
		name := fmt.Sprintf("scene_branch_%d.json", i)
		compiler := jsonschema.NewCompiler()
		if err := compiler.AddResource(name, branch); err != nil {
			return nil, fmt.Errorf("register %s: %w", name, err)
		}
		compiled, err := compiler.Compile(name)
		if err != nil {
			return nil, fmt.Errorf("compile %s: %w", name, err)
		}
		byType[sceneType] = compiled
	}
	if len(byType) == 0 {
		return nil, fmt.Errorf("no scene branches compiled")
	}
	return byType, nil
})

// ValidateScenes checks every segment's scene against the closed grammar
// (S4-01). Segments with scene == null are legal at any time (avatar-only).
// It never fails on unrelated script problems — those belong to
// ValidateScript.
func ValidateScenes(script *studiov1.StudioScript) []SceneIssue {
	branches, err := compiledSceneSchemas()
	if err != nil {
		return []SceneIssue{{SegmentID: "*", Path: "(schema)", Message: err.Error()}}
	}

	var issues []SceneIssue
	for _, seg := range script.GetSegments() {
		ref := seg.GetScene()
		if ref == nil {
			continue
		}

		sceneType := ref.GetType()
		schema, known := branches[sceneType]
		if !known {
			types := make([]string, 0, len(branches))
			for t := range branches {
				types = append(types, t)
			}
			sort.Strings(types)
			issues = append(issues, SceneIssue{
				SegmentID: seg.GetId(),
				Path:      "type",
				Message: fmt.Sprintf(
					"unknown scene type %q; expected one of: %s — see docs/guides/scene-catalog.md",
					sceneType, strings.Join(types, ", ")),
			})
			continue
		}
		raw, mErr := json.Marshal(sceneSchemaDoc{
			Type:  ref.GetType(),
			Props: ref.GetProps().AsMap(),
		})
		if mErr != nil {
			issues = append(issues, SceneIssue{
				SegmentID: seg.GetId(), Path: "(root)", Message: mErr.Error(),
			})
			continue
		}
		var doc any
		if uErr := json.Unmarshal(raw, &doc); uErr != nil {
			issues = append(issues, SceneIssue{
				SegmentID: seg.GetId(), Path: "(root)", Message: uErr.Error(),
			})
			continue
		}
		if vErrs := schema.Validate(doc); vErrs != nil {
			for _, line := range splitValidationErrors(vErrs) {
				issues = append(issues, SceneIssue{
					SegmentID: seg.GetId(),
					Path:      line.path,
					Message:   line.message,
				})
			}
			continue // schema already failed; skip cross-field check
		}
		issues = append(issues, flowEdgeIssuesFor(seg.GetId(), ref.GetProps().AsMap())...)
	}
	return issues
}

type errLine struct {
	path    string
	message string
}

// splitValidationErrors flattens jsonschema output into stable lines. The v6
// API returns a ValidationError tree; we keep instance location + message.
func splitValidationErrors(err error) []errLine {
	var out []errLine
	ve, ok := err.(*jsonschema.ValidationError)
	if !ok {
		return []errLine{{path: "(root)", message: err.Error()}}
	}
	collectVErrors(ve, &out)
	return out
}

func collectVErrors(ve *jsonschema.ValidationError, out *[]errLine) {
	if len(ve.Causes) == 0 {
		loc := strings.Join(ve.InstanceLocation, ".")
		if loc == "" {
			loc = "(root)"
		}

		// Required violations point at the OBJECT ("props"); expand into one
		// issue per missing prop so paths are exact ("props.label").
		if req, ok := ve.ErrorKind.(*kind.Required); ok {
			for _, name := range req.Missing {
				*out = append(*out, errLine{
					path:    joinPath(loc, name),
					message: "required",
				})
			}
			return
		}
		// additionalProperties: attach the offending keys to the object path.
		if extra, ok := ve.ErrorKind.(*kind.AdditionalProperties); ok {
			for _, key := range extra.Properties {
				*out = append(*out, errLine{
					path:    joinPath(loc, key),
					message: "unrecognized prop",
				})
			}
			return
		}

		*out = append(*out, errLine{path: loc, message: ve.Error()})
		return
	}
	for _, c := range ve.Causes {
		collectVErrors(c, out)
	}
}

func joinPath(base, leaf string) string {
	if base == "" || base == "(root)" {
		return leaf
	}
	return base + "." + leaf
}


// flowEdgeIssuesFor mirrors remotion-kit flowEdgeIssues: edges must reference
// declared node ids (cross-field rule not expressible in JSON Schema).
func flowEdgeIssuesFor(segmentID string, props map[string]any) []SceneIssue {
	nodesAny, _ := props["nodes"].([]any)
	edgesAny, _ := props["edges"].([]any)

	ids := map[string]bool{}
	for _, n := range nodesAny {
		obj, ok := n.(map[string]any)
		if !ok {
			continue
		}
		if id, ok := obj["id"].(string); ok && id != "" {
			ids[id] = true
		}
	}

	var issues []SceneIssue
	for i, e := range edgesAny {
		obj, ok := e.(map[string]any)
		if !ok {
			continue
		}
		for field, key := range map[string]string{"from": "from", "to": "to"} {
			_ = key
			ref, _ := obj[field].(string)
			if ref != "" && !ids[ref] {
				issues = append(issues, SceneIssue{
					SegmentID: segmentID,
					Path:      fmt.Sprintf("props.edges[%d].%s", i, field),
					Message: fmt.Sprintf(
						"references unknown node %q — see docs/guides/scene-catalog.md", ref),
				})
			}
		}
	}
	return issues
}

// WriteSceneValidationReport persists issues to <workspace>/.validation-latest.json.
func WriteSceneValidationReport(workspaceRoot string, valid bool, issues []SceneIssue) error {
	report := map[string]any{
		"valid":  valid,
		"issues": issues,
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(workspaceRoot, ".validation-latest.json")
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", tmp, err)
	}
	if err := os.Rename(tmp, path); err != nil {
		return fmt.Errorf("rename %s: %w", path, err)
	}
	return nil
}


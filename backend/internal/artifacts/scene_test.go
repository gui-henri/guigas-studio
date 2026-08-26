package artifacts

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"google.golang.org/protobuf/types/known/structpb"

	studiov1 "github.com/gui-henri/guigas-studio/backend/gen/app/studio/v1"
)

func sceneProps(t *testing.T, raw string) *structpb.Struct {
	t.Helper()
	s, err := structpb.NewStruct(map[string]any{})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.UnmarshalJSON([]byte(raw)); err != nil {
		t.Fatalf("props json: %v", err)
	}
	return s
}

func TestValidateScenes(t *testing.T) {
	tests := []struct {
		name      string
		sceneType string
		propsJSON string
		wantErr   bool
		errPath   string
	}{
		{
			name:      "valid code_typing",
			sceneType: "code_typing",
			propsJSON: `{"code":"let x = 1;"}`,
		},
		{
			name:      "unknown type",
			sceneType: "hologram",
			propsJSON: `{}`,
			wantErr:   true,
			errPath:   "type",
		},
		{
			name:      "missing required prop",
			sceneType: "big_number",
			propsJSON: `{"value":"10x"}`,
			wantErr:   true,
			errPath:   "props.label",
		},
		{
			name:      "extra prop rejected",
			sceneType: "terminal_run",
			propsJSON: `{"lines":[{"text":"ls"}],"theme":"dark"}`,
			wantErr:   true,
			errPath:   "props.theme",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			script := &studiov1.StudioScript{
				Segments: []*studiov1.Segment{
					{
						Id:    "seg-1",
						Scene: &studiov1.SceneRef{Type: tt.sceneType, Props: sceneProps(t, tt.propsJSON)},
					},
					{Id: "seg-avatar", Scene: nil}, // avatar-only is always legal
				},
			}
			issues := ValidateScenes(script)
			if !tt.wantErr {
				if len(issues) != 0 {
					t.Fatalf("want no issues, got %+v", issues)
				}
				return
			}
			if len(issues) == 0 {
				t.Fatal("want issues, got none")
			}
			if issues[0].SegmentID != "seg-1" {
				t.Fatalf("issue segment = %q, want seg-1", issues[0].SegmentID)
			}
			joined := issues[0].Path + " " + issues[0].Message
			key := strings.TrimPrefix(tt.errPath, "props.")
			if !strings.Contains(joined, key) {
				t.Fatalf("issue %q does not reference %q", joined, tt.errPath)
			}
		})
	}
}

func TestValidateScenesOrphanEdge(t *testing.T) {
	script := &studiov1.StudioScript{
		Segments: []*studiov1.Segment{
			{
				Id: "flow-seg",
				Scene: &studiov1.SceneRef{
					Type: "flow_diagram",
					Props: sceneProps(t, `{
						"nodes": [{"id": "a", "label": "A", "col": 0}],
						"edges": [{"from": "a", "to": "ghost"}]
					}`),
				},
			},
		},
	}
	issues := ValidateScenes(script)
	if len(issues) == 0 {
		t.Fatal("want orphan edge issue")
	}
	found := false
	for _, i := range issues {
		if strings.Contains(i.Message, "unknown node") && strings.Contains(i.Path, "edges[0].to") {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected edges[0].to unknown-node issue, got %+v", issues)
	}
}

func TestWriteSceneValidationReport(t *testing.T) {
	dir := t.TempDir()
	if err := WriteSceneValidationReport(dir, false, []SceneIssue{
		{SegmentID: "seg-9", Path: "props.before", Message: "required"},
	}); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(dir, ".validation-latest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var report struct {
		Valid  bool         `json:"valid"`
		Issues []SceneIssue `json:"issues"`
	}
	if err := json.Unmarshal(data, &report); err != nil {
		t.Fatal(err)
	}
	if report.Valid || len(report.Issues) != 1 || report.Issues[0].Path != "props.before" {
		t.Fatalf("unexpected report: %s", data)
	}
}

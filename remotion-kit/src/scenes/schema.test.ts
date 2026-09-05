import { describe, expect, it } from "vitest";

import {
  calloutPropsSchema,
  codeTypingPropsSchema,
  diffViewPropsSchema,
  flowDiagramPropsSchema,
  bigNumberPropsSchema,
  parseScene,
  terminalRunPropsSchema,
  timelinePropsSchema,
} from "./schema";

const validScenes = [
  { type: "code_typing", props: { code: "const x = 1;" } },
  { type: "diff_view", props: { before: ["a"], after: ["b"] } },
  { type: "terminal_run", props: { lines: [{ text: "npm run check" }] } },
  {
    type: "flow_diagram",
    props: { nodes: [{ id: "a", label: "Start" }], edges: [] },
  },
  { type: "big_number", props: { value: "10x", label: "throughput" } },
  {
    type: "timeline",
    props: { milestones: [{ label: "v1" }] },
  },
  {
    type: "callout",
    props: { variant: "info", title: "Note", body: "Read this." },
  },
] as const;

describe("scene grammar — valid cases", () => {
  for (const scene of validScenes) {
    it(`accepts a minimal ${scene.type} scene`, () => {
      const result = parseScene(scene);
      expect(result.ok).toBe(true);
    });
  }

  it("accepts scenes with protobuf-es $typeName metadata without error", () => {
    const protoScene = {
      $typeName: "app.studio.v1.SceneRef",
      type: "callout",
      props: {
        $typeName: "google.protobuf.Struct",
        variant: "info",
        title: "Note",
        body: "Read this.",
      },
    };
    const result = parseScene(protoScene);
    expect(result.ok).toBe(true);
  });
});

function expectIssue(raw: unknown, path: string, message: string) {
  const result = parseScene(raw);
  if (result.ok) {
    throw new Error(`expected ${JSON.stringify(raw)} to be invalid`);
  }
  const match = result.issues.find(
    (i) => i.path === path && i.message === message
  );
  expect(match, `issues: ${JSON.stringify(result.issues)}`).toBeDefined();
}

describe("scene grammar — invalid cases per type", () => {
  it("code_typing without code reports exact path", () => {
    expectIssue({ type: "code_typing", props: {} }, "code", "required");
  });

  it("diff_view with scalar before fails", () => {
    expectIssue(
      { type: "diff_view", props: { before: "x", after: [] } },
      "before",
      "Expected array, received string"
    );
  });

  it("terminal_run with empty lines fails", () => {
    expectIssue(
      { type: "terminal_run", props: { lines: [] } },
      "lines",
      "Array must contain at least 1 element(s)"
    );
    expectIssue(
      { type: "terminal_run", props: { lines: [{ text: "ls", kind: "sudo" }] } },
      "lines[0].kind",
      "Invalid enum value. Expected 'command' | 'output' | 'success' | 'error', received 'sudo'"
    );
  });

  it("flow_diagram node missing label reports nodes[0].label", () => {
    expectIssue(
      {
        type: "flow_diagram",
        props: { nodes: [{ id: "a" }] },
      },
      "nodes[0].label",
      "required",
    );
  });

  it("big_number with empty value fails", () => {
    expectIssue(
      { type: "big_number", props: { value: "", label: "l" } },
      "value",
      "String must contain at least 1 character(s)"
    );
  });

  it("timeline milestone missing detail is fine but missing milestones fails", () => {
    expectIssue({ type: "timeline", props: {} }, "milestones", "required");
  });

  it("callout with unknown variant fails", () => {
    expectIssue(
      {
        type: "callout",
        props: { variant: "purple", title: "t", body: "b" },
      },
      "variant",
      "Invalid enum value. Expected 'info' | 'warning' | 'success' | 'danger', received 'purple'"
    );
  });
});

describe("scene grammar — closed union enforcement", () => {
  it("rejects unknown scene type", () => {
    expectIssue(
      { type: "hologram", props: {} },
      "type",
      "unknown scene type; expected one of: code_typing, diff_view, terminal_run, flow_diagram, big_number, timeline, callout"
    );
  });

  it("rejects extra prop inside props", () => {
    expectIssue(
      {
        type: "code_typing",
        props: { code: "x", background: "#000000" },
      },
      "background",
      "unrecognized prop"
    );
  });

  it("rejects extra key at the envelope level", () => {
    expectIssue(
      { type: "big_number", props: { value: "1", label: "l" }, theme: "dark" },
      "theme",
      "unrecognized prop"
    );
  });

  it("rejects missing props entirely", () => {
    const result = parseScene({ type: "timeline" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("scene grammar — defaults applied (D-18)", () => {
  it("code_typing defaults language and charsPerSecond", () => {
    const result = codeTypingPropsSchema.parse({ code: "let a = true;" });
    expect(result.language).toBe("typescript");
    expect(result.charsPerSecond).toBe(18);
  });

  it("terminal_run defaults prompt, cursor, kind and delayFrames", () => {
    const result = terminalRunPropsSchema.parse({ lines: [{ text: "ls" }] });
    expect(result.prompt).toBe("$");
    expect(result.cursor).toBe(true);
    expect(result.lines[0].kind).toBe("output");
    expect(result.lines[0].delayFrames).toBe(0);
  });

  it("flow_diagram defaults edges to empty array", () => {
    const result = flowDiagramPropsSchema.parse({
      nodes: [{ id: "n1", label: "Only" }],
    });
    expect(result.edges).toEqual([]);
  });

  it("diff_view defaults language", () => {
    const result = diffViewPropsSchema.parse({
      before: ["old"],
      after: ["new"],
    });
    expect(result.language).toBe("typescript");
  });
});

describe("individual prop schemas stay strict and reusable", () => {
  it("callout variant accepts every documented value", () => {
    for (const v of ["info", "warning", "success", "danger"] as const) {
      expect(() =>
        calloutPropsSchema.parse({ variant: v, title: "t", body: "b" })
      ).not.toThrow();
    }
  });

  it("timeline milestone keeps optional detail", () => {
    const parsed = timelinePropsSchema.parse({
      milestones: [{ label: "a" }, { label: "b", detail: "d" }],
    });
    expect(parsed.milestones[0].detail).toBeUndefined();
    expect(parsed.milestones[1].detail).toBe("d");
  });

  it("big_number requires both value and label", () => {
    expect(bigNumberPropsSchema.safeParse({ value: "42%" }).success).toBe(
      false
    );
    expect(
      bigNumberPropsSchema.safeParse({ value: "42%", label: "faster" }).success
    ).toBe(true);
  });
});

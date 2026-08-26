import { z } from "zod";

// Closed scene grammar (SPEC §4.5): the agent composes props only — never free
// CSS. Every object is .strict(): unknown props are validation errors.
// Colors/fonts NEVER appear here; components resolve them from design tokens.
//
// Shape mirrors the proto `SceneRef` (S1-02): `{ type, props }` with a closed
// per-type props schema, so script.json validates directly against the
// generated schema/scene-props.schema.json.

export const codeTypingPropsSchema = z
  .object({
    code: z.string().min(1),
    language: z.string().default("typescript"),
    charsPerSecond: z.number().gt(0).default(18),
  })
  .strict();

export const diffViewPropsSchema = z
  .object({
    title: z.string().optional(),
    language: z.string().default("typescript"),
    before: z.array(z.string()),
    after: z.array(z.string()),
  })
  .strict();

export const terminalLineKindSchema = z.enum([
  "command",
  "output",
  "success",
  "error",
]);

export const terminalLineSchema = z
  .object({
    text: z.string().min(1),
    kind: terminalLineKindSchema.default("output"),
    delayFrames: z.number().int().nonnegative().default(0),
  })
  .strict();

export const terminalRunPropsSchema = z
  .object({
    prompt: z.string().default("$"),
    lines: z.array(terminalLineSchema).min(1),
    cursor: z.boolean().default(true),
  })
  .strict();

export const flowDiagramNodeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
  })
  .strict();

export const flowDiagramEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
  })
  .strict();

export const flowDiagramPropsSchema = z
  .object({
    nodes: z.array(flowDiagramNodeSchema).min(1),
    edges: z.array(flowDiagramEdgeSchema).default([]),
  })
  .strict();

export const bigNumberPropsSchema = z
  .object({
    value: z.string().min(1),
    label: z.string().min(1),
    context: z.string().optional(),
  })
  .strict();

export const timelineMilestoneSchema = z
  .object({
    label: z.string().min(1),
    detail: z.string().optional(),
  })
  .strict();

export const timelinePropsSchema = z
  .object({
    milestones: z.array(timelineMilestoneSchema).min(1),
  })
  .strict();

export const calloutVariantSchema = z.enum([
  "info",
  "warning",
  "success",
  "danger",
]);

export const calloutPropsSchema = z
  .object({
    variant: calloutVariantSchema,
    title: z.string().min(1),
    body: z.string().min(1),
    icon: z.string().optional(),
  })
  .strict();

function envelope<P extends z.ZodRawShape>(type: string, props: z.ZodObject<P>) {
  return z
    .object({
      type: z.literal(type),
      props,
    })
    .strict();
}

export const codeTypingSceneSchema = envelope("code_typing", codeTypingPropsSchema);
export const diffViewSceneSchema = envelope("diff_view", diffViewPropsSchema);
export const terminalRunSceneSchema = envelope("terminal_run", terminalRunPropsSchema);
export const flowDiagramSceneSchema = envelope("flow_diagram", flowDiagramPropsSchema);
export const bigNumberSceneSchema = envelope("big_number", bigNumberPropsSchema);
export const timelineSceneSchema = envelope("timeline", timelinePropsSchema);
export const calloutSceneSchema = envelope("callout", calloutPropsSchema);

const SCENE_TYPES = [
  "code_typing",
  "diff_view",
  "terminal_run",
  "flow_diagram",
  "big_number",
  "timeline",
  "callout",
] as const;

export type SceneType = (typeof SCENE_TYPES)[number];

export const sceneSchema = z.discriminatedUnion("type", [
  codeTypingSceneSchema,
  diffViewSceneSchema,
  terminalRunSceneSchema,
  flowDiagramSceneSchema,
  bigNumberSceneSchema,
  timelineSceneSchema,
  calloutSceneSchema,
]);

// Component-facing scene types are the full envelopes ({type, props}).
export type CodeTypingScene = z.infer<typeof codeTypingSceneSchema>;
export type DiffViewScene = z.infer<typeof diffViewSceneSchema>;
export type TerminalRunScene = z.infer<typeof terminalRunSceneSchema>;
export type TerminalLine = z.infer<typeof terminalLineSchema>;
export type FlowDiagramScene = z.infer<typeof flowDiagramSceneSchema>;
export type BigNumberScene = z.infer<typeof bigNumberSceneSchema>;
export type TimelineScene = z.infer<typeof timelineSceneSchema>;
export type CalloutScene = z.infer<typeof calloutSceneSchema>;

/** A parsed scene: closed union of `{ type, props }` (proto SceneRef parity). */
export type Scene = z.infer<typeof sceneSchema>;

export interface SceneParseIssue {
  path: string;
  message: string;
}

export type ParseSceneResult =
  | { ok: true; scene: Scene }
  | { ok: false; issues: SceneParseIssue[] };

const REQUIRED_RE = /^required$|required/i;
const UNRECOGNIZED_RE = /^Unrecognized key\(s\) in object: (.+)$/;

function formatPath(segments: (string | number)[]): string {
  let out = "";
  for (const segment of segments) {
    out +=
      typeof segment === "number" ? `[${segment}]` : out ? `.${segment}` : String(segment);
  }
  return out.length > 0 ? out : "(root)";
}

function formatIssues(error: z.ZodError): SceneParseIssue[] {
  const issues: SceneParseIssue[] = [];
  for (const issue of error.issues) {
    // Issue paths are relative to the envelope; strip the leading "props."
    // so callers see prop paths exactly ("nodes[2].label").
    const segments = issue.path.map((p) => p as string | number);
    if (segments[0] === "props") {
      segments.shift();
    }

    const unrecognized = UNRECOGNIZED_RE.exec(issue.message);
    if (unrecognized) {
      // Zod reports strict() violations at the object level; surface one
      // issue per offending key for precise paths ("props.background").
      const objectPrefix =
        segments.length > 0
          ? segments.join(".")
          : "";
      for (const key of unrecognized[1].split(", ")) {
        const cleanKey = key.replace(/^'|'$/g, "");
        issues.push({
          path: objectPrefix ? `${objectPrefix}.${cleanKey}` : cleanKey,
          message: "unrecognized prop",
        });
      }
      continue;
    }

    let message = issue.message;
    if (issue.code === "invalid_type" && REQUIRED_RE.test(message)) {
      message = "required";
    }
    if (
      issue.code === "invalid_union_discriminator" &&
      issue.path.length === 1 &&
      issue.path[0] === "type"
    ) {
      message = `unknown scene type; expected one of: ${SCENE_TYPES.join(", ")}`;
    }
    issues.push({ path: formatPath(segments), message });
  }
  return issues;
}

/**
 * Parses a raw `scene` value (the protojson SceneRef of a StudioScript
 * segment) against the closed grammar. Returns readable issues with exact
 * prop paths on failure — never throws.
 */
export function parseScene(raw: unknown): ParseSceneResult {
  const result = sceneSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, scene: result.data };
  }
  return { ok: false, issues: formatIssues(result.error) };
}

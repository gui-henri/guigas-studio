import path from "node:path";
import fs from "node:fs";

import { selectComposition, renderMedia } from "@remotion/renderer";
import { parseScene } from "@guigas/remotion-kit";

import type { JobContext } from "./types.js";
import { NonRetryableError } from "./errors.js";

export interface RenderLongDeps {
  compositionId?: string;
  spriteFileName?: string;
}

interface TimelineJson {
  durationMs: number | string;
}

export interface BuiltInputProps {
  title: string;
  segments: Array<{ id: string; scene: unknown }>;
  timelines: Record<string, unknown>;
  audioFiles: Record<string, string>;
  spriteSheetUrl: string;
  spriteMeta: Record<string, unknown>;
  showSubtitles: boolean;
  subtitleWordsBySeg: Record<string, never>;
}

/**
 * Validates the synced inputs and builds LongForm inputProps (S5-05 step 4).
 * Scene grammar violations fail FAST with a non-retryable error — bad data
 * does not improve with retries.
 */
export function buildInputProps(root: string): BuiltInputProps {
  const rawScript = fs.readFileSync(path.join(root, "script.json"), "utf8");
  const script = JSON.parse(rawScript) as {
    post?: string;
    segments?: Array<{ id: string; scene?: unknown }>;
  };

  const timelines: Record<string, unknown> = {};
  const audioFiles: Record<string, string> = {};
  const segments: Array<{ id: string; scene: unknown }> = [];

  for (const seg of script.segments ?? []) {
    const timelinePath = path.join(root, "timelines", `${seg.id}.timeline.json`);
    if (!fs.existsSync(timelinePath)) {
      throw new NonRetryableError(`missing timeline for segment ${seg.id}`);
    }
    const timeline = JSON.parse(fs.readFileSync(timelinePath, "utf8")) as TimelineJson;
    if (!Number(timeline.durationMs)) {
      throw new NonRetryableError(`timeline ${seg.id} has no durationMs`);
    }
    timelines[seg.id] = timeline;

    const wavPath = path.join(root, "audio", `${seg.id}.wav`);
    if (!fs.existsSync(wavPath)) {
      throw new NonRetryableError(`missing audio for segment ${seg.id}`);
    }
    audioFiles[seg.id] = `audio/${seg.id}.wav`;

    if (seg.scene) {
      const parsed = parseScene(seg.scene);
      if (!parsed.ok) {
        const detail = parsed.issues.map((iss) => `${iss.path}: ${iss.message}`).join("; ");
        throw new NonRetryableError(`invalid scene in ${seg.id}: ${detail}`);
      }
      segments.push({ id: seg.id, scene: parsed.scene });
    } else {
      segments.push({ id: seg.id, scene: null });
    }
  }

  if (segments.length === 0) {
    throw new NonRetryableError("script.json has no segments");
  }

  return {
    title: script.post ?? "Guigas Studio",
    segments,
    timelines,
    audioFiles,
    spriteSheetUrl: "assets/sprite-placeholder.png",
    spriteMeta: {},
    showSubtitles: false,
    subtitleWordsBySeg: {},
  };
}

/** Stage handler factory — S5-05 render_long. */
export function makeRenderLongStage(deps: RenderLongDeps = {}) {
  return async (ctx: JobContext): Promise<void> => {
    const root = ctx.workDir(ctx.slug);
    const inputProps = buildInputProps(root); // throws NonRetryableError fast

    const bundleRef = globalThis as unknown as { __guigasBundleUrl?: string };
    const serveUrl = bundleRef.__guigasBundleUrl;
    if (!serveUrl) {
      throw new Error("bundle not built — run the bundle stage first");
    }

    const compositionId = deps.compositionId ?? "LongForm";
    const composition = await selectComposition({
      serveUrl,
      id: compositionId,
      inputProps: inputProps as unknown as Record<string, unknown>,
    });

    const outDir = path.join(root, "out");
    fs.mkdirSync(outDir, { recursive: true });
    const output = path.join(outDir, "long.mp4");

    let lastReported = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: output,
      inputProps: inputProps as unknown as Record<string, unknown>,
      onProgress: ({ progress: renderProgress }) => {
        const percent = Math.min(99, Math.round(renderProgress * 100));
        // Throttle ≤1 update per integer percent point.
        if (percent !== lastReported) {
          lastReported = percent;
          void ctx.report("render_long", percent);
        }
      },
    });

    const stat = fs.statSync(output);
    ctx.log.info({ output, bytes: stat.size }, "long-form rendered");
  };
}

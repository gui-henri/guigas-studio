import path from "node:path";
import fs from "node:fs";

import { selectComposition, renderMedia } from "@remotion/renderer";

import { planShorts, type ShortCut } from "../script/shorts.js";
import {
  buildInputProps,
  type BuiltInputProps,
} from "./render-long.js";
import type { JobContext } from "./types.js";
import { NonRetryableError } from "./errors.js";

export interface ShortsDeps {
  compositionId?: string;
}

/**
 * S5-06: renders each [SHORT#n] cut as its own vertical composition in the
 * SAME job as the long. Per-short failure records a warning and moves on —
 * the long is never affected. Marker-count divergence vs the approved
 * payload fails the job WITHOUT retry (script changed after approval).
 */
export function makeShortsStage() {
  return async (ctx: JobContext): Promise<void> => {
    const root = ctx.workDir(ctx.slug);

    const scriptPath = path.join(root, "script.json");
    const script = JSON.parse(fs.readFileSync(scriptPath, "utf8")) as {
      segments?: Array<{ id: string; narration_pt?: string }>;
    };

    let cuts: ShortCut[];
    try {
      cuts = planShorts(script.segments ?? []).cuts;
    } catch (err) {
      throw new NonRetryableError(
        err instanceof Error ? err.message : String(err)
      );
    }
    if (cuts.length !== ctx.expectedShorts) {
      throw new NonRetryableError(
        `short markers (${cuts.length}) diverge from approved expected_shorts (${ctx.expectedShorts}) — re-approve scenes`
      );
    }

    const bundleRef = globalThis as unknown as { __guigasBundleUrl?: string };
    const serveUrl = bundleRef.__guigasBundleUrl;
    if (!serveUrl) {
      throw new Error("bundle not built — run the bundle stage first");
    }

    const baseProps = buildInputProps(root);
    const outDir = path.join(root, "out");
    fs.mkdirSync(outDir, { recursive: true });

    for (const cut of cuts) {
      await ctx.checkCancelled();
      const stageName = `short_${cut.n}`;
      try {
        await renderShort(ctx, {
          serveUrl,
          stageName,
          cut,
          baseProps,
          compositionId: "Short",
          output: path.join(outDir, `short-${cut.n}.mp4`),
        });
      } catch (err) {
        if (err instanceof NonRetryableError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        ctx.warnings.push(`short-${cut.n}: ${message}`);
        ctx.log.warn({ stage: stageName, err_message: message }, "short failed; continuing");
      }
    }
  };
}

async function renderShort(
  ctx: JobContext,
  args: {
    serveUrl: string;
    stageName: string;
    cut: ShortCut;
    baseProps: BuiltInputProps;
    compositionId: string;
    output: string;
  }
): Promise<void> {
  // Subset of props for THIS cut only.
  const inputProps: BuiltInputProps = {
    ...args.baseProps,
    segments: args.baseProps.segments.filter((s) =>
      args.cut.segmentIds.includes(s.id)
    ),
    timelines: Object.fromEntries(
      args.cut.segmentIds
        .filter((id) => id in args.baseProps.timelines)
        .map((id) => [id, args.baseProps.timelines[id]])
    ),
    audioFiles: Object.fromEntries(
      Object.entries(args.baseProps.audioFiles).filter(([id]) =>
        args.cut.segmentIds.includes(id)
      )
    ),
    subtitleWordsBySeg: Object.fromEntries(
      Object.entries(args.baseProps.subtitleWordsBySeg).filter(([id]) =>
        args.cut.segmentIds.includes(id)
      )
    ),
  };

  const composition = await selectComposition({
    serveUrl: args.serveUrl,
    id: args.compositionId,
    inputProps: inputProps as unknown as Record<string, unknown>,
  });

  let lastReported = -1;
  await renderMedia({
    composition,
    serveUrl: args.serveUrl,
    codec: "h264",
    outputLocation: args.output,
    inputProps: inputProps as unknown as Record<string, unknown>,
    onProgress: ({ progress: renderProgress }) => {
      const percent = Math.min(99, Math.round(renderProgress * 100));
      if (percent !== lastReported) {
        lastReported = percent;
        void ctx.report(args.stageName, percent);
      }
    },
  });
  await ctx.report(args.stageName, 100);
  ctx.log.info({ short: args.cut.n }, "short rendered");
}

import path from "node:path";

import type { InputFile } from "../gen/app/studio/v1/jobs_pb.js";
import { syncInputs, type SyncManifestEntry } from "./sync.js";
import type { StageHandler } from "./types.js";
import { makeBundle } from "./bundle.js";
import { makeRenderLongStage } from "./render-long.js";
import { makeShortsStage } from "./shorts.js";
import { mixSoundtrack } from "./soundtrack.js";
import { makeUploadStage } from "./upload-stage.js";

export interface StageEnv {
  baseUrl: string;
  bearerToken: string;
  workDir: string;
  cacheDir: string;
  remotionEntry?: string;
}

/** Cross-stage handoff: the bundle URL produced by `bundle`. */
const bundleRef = globalThis as unknown as { __guigasBundleUrl?: string };

/**
 * Ordered stage pipeline. sync/bundle/render_long are REAL since S5-04/05;
 * S5-06 plugs `shorts`, S5-07 `upload`.
 */
export function defaultStages(
  manifest: readonly InputFile[],
  env: StageEnv
): Array<[string, StageHandler]> {
  const entries: SyncManifestEntry[] = manifest.map((f) => ({
    path: f.path,
    sha256: f.sha256,
    bytes: Number(f.bytes),
  }));

  const names = [
    "sync",
    "soundtrack",
    "bundle",
    "render_long",
    "shorts",
    "upload",
  ] as const;

  const syncStage: StageHandler = async (ctx) => {
    await ctx.checkCancelled();
    if (entries.length === 0) {
      ctx.log.info("no input manifest on job; skipping download");
      await ctx.report("sync", 100);
      return;
    }
    ctx.log.info({ files: entries.length }, "syncing inputs");
    const result = await syncInputs(ctx, entries, {
      baseUrl: env.baseUrl,
      videoId: ctx.videoId,
      bearerToken: env.bearerToken,
    });
    ctx.log.info(result, "inputs synced");
  };

  const bundleStage: StageHandler = async (ctx) => {
    const serveUrl = await makeBundle(ctx, {
      entryPoint: env.remotionEntry ?? process.env["REMOTION_ENTRY"],
      cacheDir: path.join(env.cacheDir, "webpack"),
    });
    bundleRef.__guigasBundleUrl = serveUrl;
    await ctx.report("bundle", 100);
  };

  const renderLongStage = makeRenderLongStage();
  const shortsStage = makeShortsStage();
  const uploadStage = makeUploadStage({ baseUrl: env.baseUrl, bearerToken: env.bearerToken });
  const soundtrackStage: StageHandler = mixSoundtrack;

  return names.map((name) => [
    name,
    name === "sync"
      ? syncStage
      : name === "soundtrack"
        ? soundtrackStage
        : name === "bundle"
          ? bundleStage
          : name === "render_long"
            ? renderLongStage
            : name === "shorts"
              ? shortsStage
              : name === "upload"
                ? uploadStage
                : async (ctx) => {
                    await ctx.checkCancelled();
                    ctx.log.info({ stage: name }, "stage placeholder");
                    await ctx.report(name, Math.round((names.indexOf(name) + 1) * (100 / names.length)));
                  },
  ]);
}

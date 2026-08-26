import path from "node:path";
import fs from "node:fs";

import { bundle } from "@remotion/bundler";

import type { JobContext } from "./types.js";

export interface BundleOptions {
  /** Entry of the compositions project (remotion-kit/src/index.ts). */
  entryPoint?: string;
  /** Fixed webpack cache dir reused across jobs. */
  cacheDir: string;
}

const DEFAULT_ENTRY_CANDIDATES = [
  // in-repo workspace layout (monorepo checkout)
  "../../remotion-kit/src/index.ts",
];

/**
 * Builds the Remotion bundle LOCALLY (T-03): the server never ships a
 * bundle. Webpack cache is shared across jobs to keep rebuilds ~seconds.
 */
export async function makeBundle(
  ctx: JobContext,
  opts: BundleOptions
): Promise<string> {
  await ctx.checkCancelled();
  const outDir = path.join(ctx.workDir(ctx.slug), "bundle");
  fs.mkdirSync(outDir, { recursive: true });

  const entryPoint = opts.entryPoint
    ? path.resolve(opts.entryPoint)
    : resolveDefaultEntry();

  ctx.log.info({ entryPoint }, "bundling remotion project");
  const serveUrl = await bundle(entryPoint, (progress) => {
    if (progress % 25 === 0) {
      ctx.log.info({ stage: "bundle", progress }, "bundle progress");
    }
  }, {
    outDir,
    publicDir: ctx.workDir(ctx.slug), // synced inputs become staticFile roots
  });
  ctx.log.info({ serveUrl }, "bundle ready");
  return serveUrl;
}

function resolveDefaultEntry(): string {
  for (const candidate of DEFAULT_ENTRY_CANDIDATES) {
    const abs = path.resolve(candidate);
    if (fs.existsSync(abs)) return abs;
  }
  throw new Error(
    `remotion entry not found; set REMOTION_ENTRY to remotion-kit/src/index.ts`
  );
}

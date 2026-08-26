import type { StageHandler } from "./types.js";
import { collectRenderFiles } from "./render-long.js";
import {
  uploadRenders,
  type RenderFile,
} from "./upload.js";

export interface UploadStageDeps {
  baseUrl: string;
  bearerToken: string;
}

/**
 * S5-07 upload stage: pushes every local MP4 through the chunked endpoint.
 * The verified artifact list lands on ctx.artifacts so the final
 * CompleteJob carries path/sha256/bytes/duration — the server re-verifies
 * each hash before flipping the video to final_review.
 */
export function makeUploadStage(deps: UploadStageDeps): StageHandler {
  return async (ctx) => {
    await ctx.checkCancelled();
    const root = ctx.workDir(ctx.slug);
    const files = collectRenderFiles(root);
    if (files.length === 0) {
      throw new Error("no renders found in out/ — nothing to upload");
    }

    await uploadRenders(
      ctx,
      files as readonly RenderFile[],
      {
        baseUrl: deps.baseUrl,
        bearerToken: deps.bearerToken,
        videoId: ctx.videoId,
      }
    );

    ctx.artifacts.push(
      ...files.map((f) => ({
        path: `renders/${f.fileName}`,
        sha256: f.sha256,
        bytes: f.bytes,
      }))
    );
  };
}

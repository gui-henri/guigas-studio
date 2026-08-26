import type { StageHandler } from "./types.js";

/**
 * Ordered stage pipeline for the render job. S5-04 plugs `sync`, S5-05
 * `bundle` + `render_long`, S5-06 `shorts`, S5-07 `upload`. Until then each
 * stage reports its slot's progress slice and no-ops.
 */
export function defaultStages(): Array<[string, StageHandler]> {
  const names = ["sync", "bundle", "render_long", "shorts", "upload"] as const;

  return names.map((name) => [
    name,
    async (ctx) => {
      await ctx.checkCancelled();
      ctx.log.info({ stage: name }, "stage placeholder");
      // Placeholder slice of the progress bar until the real handler lands.
      await ctx.report(name, Math.round((names.indexOf(name) + 1) * (100 / names.length)));
    },
  ]);
}

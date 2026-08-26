import type { Logger } from "pino";

/**
 * Stage handler contract (S5-03 step 5): real handlers (sync, bundle,
 * render_long, shorts, upload) are plugged by S5-04+.
 */
export interface JobContext {
  jobId: string;
  videoId: string;
  slug: string;
  expectedShorts: number;
  /** Accumulated non-fatal warnings shipped with CompleteJob. */
  warnings: string[];
  log: Logger;
  /** Report progress to the server (persisted + mirrored over SSE). */
  report(stage: string, percent: number): Promise<number>;
  /** Throws JobCancelled when the server flagged the job as cancelled. */
  checkCancelled(): Promise<void>;
  /** Per-video scratch directory under WORK_DIR. */
  workDir(slug: string): string;
}

export type StageHandler = (ctx: JobContext) => Promise<void>;

export class JobCancelled extends Error {
  constructor(jobId: string) {
    super(`job ${jobId} cancelled by server`);
    this.name = "JobCancelled";
  }
}

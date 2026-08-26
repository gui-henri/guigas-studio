import path from "node:path";
import fs from "node:fs";

import type { RunnerClient } from "./client.js";
import { jobLogger } from "./logger.js";
import {
  JobCancelled,
  type JobContext,
  type StageHandler,
} from "./stages/types.js";
import { NonRetryableError } from "./stages/errors.js";

export interface ClaimedJob {
  jobId: string;
  videoId: string;
  slug: string;
  expectedShorts: number;
}

export interface RunOptions {
  workDir: string;
  heartbeatIntervalMs: number;
  /** Server base + runner token for authenticated file downloads (S5-04). */
  baseUrl: string;
  bearerToken: string;
}

/**
 * Runs one claimed job through its ordered stages (S5-03 step 6): heartbeat
 * fires INDEPENDENTLY of the work (minutes-long renders must not look dead),
 * and cancel is checked cooperatively before every stage (D-10).
 */
export async function runStages(
  client: RunnerClient,
  job: ClaimedJob,
  stages: ReadonlyArray<[string, StageHandler]>,
  opts: RunOptions
): Promise<"completed" | "cancelled" | "failed"> {
  const log = jobLogger({ job_id: job.jobId });
  const progress = { stage: "start", percent: 0 };

  const heartbeat = setInterval(() => {
    void client.jobs
      .updateProgress({
        jobId: job.jobId,
        percent: progress.percent,
        stage: progress.stage,
      })
      .catch(() => {
        /* transient network error — next tick retries */
      });
  }, opts.heartbeatIntervalMs);

  const ctx: JobContext = {
    jobId: job.jobId,
    videoId: job.videoId,
    slug: job.slug,
    expectedShorts: job.expectedShorts,
    log,
    async report(stage, percent) {
      progress.stage = stage;
      progress.percent = clampPercent(percent);
      await client.jobs.updateProgress({
        jobId: job.jobId,
        percent: progress.percent,
        stage,
      });
      return progress.percent;
    },
    async checkCancelled() {
      await checkCancelled(client, job);
    },
    workDir(slug) {
      const dir = path.join(opts.workDir, slug);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    },
  };

  try {
    for (const [stageName, handler] of stages) {
      await checkCancelled(client, job);
      log.info({ stage: stageName }, "stage start");
      await handler(ctx);
      log.info({ stage: stageName }, "stage done");
    }
    await client.jobs.completeJob({ jobId: job.jobId });
    log.info("job completed");
    return "completed";
  } catch (err) {
    if (err instanceof JobCancelled) {
      log.warn("job cancelled cooperatively");
      return "cancelled";
    }
    const message = err instanceof Error ? err.message : String(err);
    const retryable = !(err instanceof NonRetryableError);
    log.error(
      { err_message: message, retryable },
      retryable ? "job failed; reporting retryable failure" : "non-retryable failure"
    );
    try {
      await client.jobs.failJob({ jobId: job.jobId, reason: message, retryable });
    } catch (reportErr) {
      log.error({ err_message: String(reportErr) }, "FailJob itself failed; server heartbeat expiry will reclaim");
    }
    return "failed";
  } finally {
    clearInterval(heartbeat);
  }
}

async function checkCancelled(client: RunnerClient, job: ClaimedJob): Promise<void> {
  const view = await client.jobs.getJob({ jobId: job.jobId });
  if (view.job?.cancelRequested) {
    throw new JobCancelled(job.jobId);
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

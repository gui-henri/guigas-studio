import { loadConfig } from "./config.js";
import { createRunnerClient } from "./client.js";
import { logger } from "./logger.js";
import { runStages, type ClaimedJob } from "./run.js";
import { decodePayload } from "./decode.js";
import { defaultStages } from "./stages/index.js";

/**
 * Runner daemon main loop (S5-03 step 6): poll ClaimJob when idle (~10 s),
 * execute stages with heartbeat + cooperative cancel-check, exit cleanly on
 * SIGINT (job stays claimed; server-side heartbeat expiry reclaims it).
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const client = createRunnerClient(config);
  const log = logger.child({ runner_id: config.runnerId });

  let shuttingDown = false;
  process.on("SIGINT", () => {
    log.warn("SIGINT received; finishing current cycle and stopping polling");
    shuttingDown = true;
  });

  log.info({ studio_url: config.studioUrl, work_dir: config.workDir }, "runner started");

  while (!shuttingDown) {
    try {
      const response = await client.jobs.claimJob({ runnerId: config.runnerId });
      if (!response.job) {
        log.debug("no job");
        await sleep(config.pollIntervalMs);
        continue;
      }

      const payload = decodePayload(response.job.payloadJson);
      const job: ClaimedJob = {
        jobId: response.job.id,
        videoId: response.job.videoId,
        slug: payload.slug,
        expectedShorts: payload.expectedShorts,
      };
      log.info({ job_id: job.jobId, slug: job.slug }, "job claimed");

      const manifest = response.job.inputManifest ?? [];
      const outcome = await runStages(
        client,
        job,
        defaultStages(manifest, {
          baseUrl: config.studioUrl,
          bearerToken: config.runnerToken,
        }),
        {
          baseUrl: config.studioUrl,
          bearerToken: config.runnerToken,
          workDir: config.workDir,
          heartbeatIntervalMs: config.heartbeatIntervalMs,
        }
      );
      log.info({ outcome }, "job cycle finished");
    } catch (err) {
      // Transport-level failure (server down / network): back off and retry.
      log.error({ err_message: err instanceof Error ? err.message : String(err) }, "poll cycle failed");
      await sleep(Math.max(2_000, config.pollIntervalMs));
    }
  }

  log.info("runner stopped");
}

// Graceful Ctrl+C: stop the loop; an in-flight job keeps its claim until the
// server-side heartbeat expiry reclaims it (no local retry — S5-01 owns retry).
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.exitCode = 1;
main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((err) => {
    logger.error({ err_message: err instanceof Error ? err.message : String(err) }, "runner crashed");
  });

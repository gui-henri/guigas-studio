import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";

import { JobService } from "./gen/app/studio/v1/jobs_pb.js";
import type { RunnerConfig } from "./config.js";

/**
 * Connect client for JobService (S5-03 step 3): unary calls over HTTP with
 * the runner PAT on every request. The server accepts this token ONLY for
 * JobService procedures (T-06).
 */
export function createRunnerClient(config: RunnerConfig) {
  const transport = createConnectTransport({
    baseUrl: config.studioUrl,
    httpVersion: "1.1",
    interceptors: [
      (next) => (req) => {
        req.header.set("Authorization", `Bearer ${config.runnerToken}`);
        return next(req);
      },
    ],
  });

  return {
    jobs: createClient(JobService, transport),
  };
}

export type RunnerClient = ReturnType<typeof createRunnerClient>;

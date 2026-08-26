import fs from "node:fs";
import path from "node:path";

/**
 * Runner configuration (S5-03 step 2): read once, validated at boot —
 * missing mandatory env fails fast with a readable message.
 */
export interface RunnerConfig {
  studioUrl: string;
  runnerToken: string;
  runnerId: string;
  workDir: string;
  /** Remotion entry override (defaults to the monorepo layout). */
  remotionEntry?: string;
  /** Fixed webpack cache root reused across jobs. */
  cacheDir: string;
  pollIntervalMs: number;
  heartbeatIntervalMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    console.error(`[runner] missing required env ${name}`);
    process.exit(1);
  }
  return value.trim();
}

function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`[runner] invalid ${name}=${raw}`);
    process.exit(1);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const workDir = path.resolve(
    env["WORK_DIR"] && env["WORK_DIR"].length > 0 ? env["WORK_DIR"] : "./work"
  );
  fs.mkdirSync(workDir, { recursive: true });

  return {
    studioUrl: requireEnv("STUDIO_URL"),
    runnerToken: requireEnv("RUNNER_TOKEN"),
    runnerId:
      env["RUNNER_ID"] && env["RUNNER_ID"].length > 0
        ? env["RUNNER_ID"]
        : `runner-${process.pid}`,
    workDir,
    remotionEntry:
      env["REMOTION_ENTRY"] && env["REMOTION_ENTRY"].length > 0
        ? env["REMOTION_ENTRY"]
        : undefined,
    cacheDir: path.resolve(env["CACHE_DIR"] && env["CACHE_DIR"].length > 0 ? env["CACHE_DIR"] : "./.cache"),
    pollIntervalMs: numberEnv("POLL_INTERVAL_MS", 10_000),
    heartbeatIntervalMs: numberEnv("HEARTBEAT_INTERVAL_MS", 10_000),
  };
}

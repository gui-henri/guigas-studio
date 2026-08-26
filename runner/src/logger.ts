import pino from "pino";

/**
 * Structured one-line JSON logger (S5-03 step 4). Child loggers carry
 * job_id/stage so every relevant line is greppable.
 */
export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function jobLogger(bindings: { job_id?: string; stage?: string }) {
  return logger.child(bindings);
}

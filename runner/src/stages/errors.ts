/**
 * Marks failures that will not improve with retry (bad data, missing files).
 * The loop maps this to FailJob(retryable=false).
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

// Pure, frame-based typing progress — deterministic across out-of-order
// parallel renders (no timers, no random, no Date.now).

/**
 * How many characters are visible at the given frame.
 * `charsPerSecond` comes straight from the scene props (default 18).
 */
export function charsVisible(
  frame: number,
  fps: number,
  totalChars: number,
  charsPerSecond: number
): number {
  if (totalChars <= 0) {
    return 0;
  }
  if (charsPerSecond <= 0) {
    return totalChars;
  }
  const elapsedSeconds = Math.max(0, frame) / fps;
  return Math.min(totalChars, Math.floor(elapsedSeconds * charsPerSecond));
}

/** Cursor blinks by frame parity within the period (2 frames on/off). */
export function isCursorVisible(frame: number, periodFrames = 16): boolean {
  if (periodFrames <= 0) {
    return true;
  }
  const phase = ((Math.max(0, Math.floor(frame)) % periodFrames) + periodFrames) % periodFrames;
  return phase < periodFrames / 2;
}

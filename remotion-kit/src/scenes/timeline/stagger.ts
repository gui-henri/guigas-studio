// Pure stagger helper — milestone i starts at i * perItemFrames after the
// base offset. Deterministic, trivially testable.
export function staggerFrames(
  index: number,
  perItemFrames: number,
  baseFrames = 0
): number {
  return baseFrames + Math.max(0, Math.floor(index)) * perItemFrames;
}

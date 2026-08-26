// Layout selector — pure, unit-tested. Encodes SPEC §2 #4: the avatar is the
// PROTAGONIST; technical visuals only appear where a scene exists.
export type SegmentLayout = "fullscreen" | "split" | "overlay";

export interface LayoutDecision {
  layout: Exclude<SegmentLayout, "fullscreen">;
}

/**
 * Decides how a segment composes.
 * - No scene → fullscreen avatar (layout prop ignored).
 * - Scene present → "split" by default (avatar ~40% left + visual panel),
 *   or "overlay" when explicitly requested (avatar fullscreen + floating card).
 * - Explicit "fullscreen" WITH a scene is rejected: it would hide the visual
 *   the author asked for — callers should drop the scene instead.
 */
export function selectLayout(
  sceneType: string | null | undefined,
  requested?: SegmentLayout
): LayoutDecision {
  if (!sceneType) {
    return { layout: "split" };
  }
  if (requested === "overlay") {
    return { layout: "overlay" };
  }
  if (requested === "fullscreen") {
    throw new Error(
      'layout="fullscreen" cannot be combined with a scene — remove the scene instead'
    );
  }
  return { layout: "split" };
}

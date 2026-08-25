// Synthetic 52-dim blendshape vectors for tests (S2-03).
import { BLENDSHAPE_COUNT, BLENDSHAPE_NAMES } from "../stateMapping";

export function namedVector(values: Record<string, number>): number[] {
  return BLENDSHAPE_NAMES.map((n) => values[n] ?? 0);
}

export const NEUTRAL = namedVector({});
export const FULL_LENGTH_ZERO = new Array<number>(BLENDSHAPE_COUNT).fill(0);
export const ALL_ZERO = NEUTRAL;
export const JAW_OPEN = namedVector({ jawOpen: 0.8 });
export const SMILE = namedVector({ mouthSmileLeft: 0.7, mouthSmileRight: 0.6, jawOpen: 0.3 });
export const BROWS_UP = namedVector({ browInnerUp: 0.9, jawOpen: 0.1 });
export const BROWS_DOWN = namedVector({ browDownLeft: 0.7, browDownRight: 0.6 });
export const GAZE_DOWN = namedVector({ eyeLookDownLeft: 0.8, eyeLookDownRight: 0.8 });
export const TALKING_SEQUENCE = [
  NEUTRAL,
  JAW_OPEN,
  NEUTRAL,
  JAW_OPEN,
  NEUTRAL,
];

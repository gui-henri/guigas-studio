// Pure blendshape-to-sprite-state mapping (S2-03). No DOM, no network —
// reusable in the browser during recording and later in the render pipeline.
//
// Precedence (documented decision, tune via thresholds not ordering):
//   surprised > happy > thoughtful > talking > idle
// Clear expressions win over talking because talking is the base state while
// recording narration.

export type SpriteState = 'idle' | 'talking' | 'happy' | 'thoughtful' | 'surprised';
export type MouthShape = 'rest' | 'open_a' | 'rounded_o' | 'wide_e';

export interface StateThresholds {
  talkJawOpen: number;
  smile: number;
  surpriseBrow: number;
  thoughtfulBrowDown: number;
  gazeDown: number;
  minHoldMs: number;
}

export const DEFAULT_THRESHOLDS: StateThresholds = {
  talkJawOpen: 0.15,
  smile: 0.25,
  surpriseBrow: 0.25,
  thoughtfulBrowDown: 0.22,
  gazeDown: 0.25,
  minHoldMs: 120,
};

export interface BlendshapeSample {
  t: number;
  bs: number[];
}

export interface StateSample {
  t: number;
  state: SpriteState;
}

/** MediaPipe blendshape names this module understands (subset used for
 *  mapping); consumers pass records so array layout never couples here. */
export const BLENDSHAPE_NAMES = [
  '_neutral', 'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft',
  'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
  'eyeLookUpLeft', 'eyeLookUpRight', 'eyeSquintLeft', 'eyeSquintRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight', 'mouthClose',
  'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight',
  'mouthFunnel', 'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight',
  'tongueOut',
] as const;

export const BLENDSHAPE_COUNT = 52;

/** Convert the positional array emitted by the worker into a named record.
 *  If category names are provided by MediaPipe, they are used directly. */
export function bsArrayToRecord(bs: number[], names?: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (names && names.length === bs.length) {
    for (let i = 0; i < bs.length; i++) {
      if (names[i]) out[names[i]] = bs[i];
    }
    return out;
  }
  for (let i = 0; i < BLENDSHAPE_NAMES.length && i < bs.length; i++) {
    out[BLENDSHAPE_NAMES[i]] = bs[i];
  }
  return out;
}

function maxOf(...vals: number[]): number {
  return vals.reduce((a, b) => (b > a ? b : a), vals[0]);
}

export function mapBlendshapesToState(
  bs: Record<string, number>,
  th: StateThresholds = DEFAULT_THRESHOLDS
): SpriteState {
  const innerBrowUp = bs.browInnerUp ?? 0;
  const outerBrowUp = maxOf(bs.browOuterUpLeft ?? 0, bs.browOuterUpRight ?? 0);
  const eyeWide = maxOf(bs.eyeWideLeft ?? 0, bs.eyeWideRight ?? 0);
  if (innerBrowUp >= th.surpriseBrow || outerBrowUp >= th.surpriseBrow || eyeWide >= 0.30) {
    return 'surprised';
  }

  const smile = maxOf(bs.mouthSmileLeft ?? 0, bs.mouthSmileRight ?? 0);
  const cheekSquint = maxOf(bs.cheekSquintLeft ?? 0, bs.cheekSquintRight ?? 0);
  if (smile >= th.smile || (smile >= 0.18 && cheekSquint >= 0.20)) {
    return 'happy';
  }

  const browDown = maxOf(bs.browDownLeft ?? 0, bs.browDownRight ?? 0);
  const gazeDown = maxOf(bs.eyeLookDownLeft ?? 0, bs.eyeLookDownRight ?? 0);
  const frown = maxOf(bs.mouthFrownLeft ?? 0, bs.mouthFrownRight ?? 0);
  if (browDown >= th.thoughtfulBrowDown || gazeDown >= th.gazeDown || frown >= 0.22) {
    return 'thoughtful';
  }

  const jawOpen = bs.jawOpen ?? 0;
  const mouthLowerDown = maxOf(bs.mouthLowerDownLeft ?? 0, bs.mouthLowerDownRight ?? 0);
  const funnel = bs.mouthFunnel ?? 0;
  const pucker = bs.mouthPucker ?? 0;
  if (
    jawOpen >= th.talkJawOpen ||
    mouthLowerDown >= 0.18 ||
    funnel >= 0.18 ||
    pucker >= 0.18
  ) {
    return 'talking';
  }

  return 'idle';
}

export function mapSampleToState(
  bs: number[],
  th: StateThresholds = DEFAULT_THRESHOLDS,
  names?: string[]
): SpriteState {
  return mapBlendshapesToState(bsArrayToRecord(bs, names), th);
}

/** Determines the dynamic mouth shape column for real-time live preview. */
export function mapBlendshapesToMouth(bs: Record<string, number>): MouthShape {
  const jawOpen = bs.jawOpen ?? 0;
  const mouthLowerDown = maxOf(bs.mouthLowerDownLeft ?? 0, bs.mouthLowerDownRight ?? 0);
  const pucker = bs.mouthPucker ?? 0;
  const funnel = bs.mouthFunnel ?? 0;
  const stretch = maxOf(bs.mouthStretchLeft ?? 0, bs.mouthStretchRight ?? 0);
  const smile = maxOf(bs.mouthSmileLeft ?? 0, bs.mouthSmileRight ?? 0);
  const dimple = maxOf(bs.mouthDimpleLeft ?? 0, bs.mouthDimpleRight ?? 0);

  // Rounded / O shapes (pucker, funnel)
  if (pucker >= 0.18 || funnel >= 0.20) {
    return 'rounded_o';
  }

  // Wide / E shapes (smile, stretch, dimple)
  if (stretch >= 0.18 || (smile >= 0.22 && jawOpen < 0.25) || dimple >= 0.22) {
    return 'wide_e';
  }

  // Open / A shapes (jaw open, lower lip down)
  if (jawOpen >= 0.14 || mouthLowerDown >= 0.18) {
    return 'open_a';
  }

  return 'rest';
}

export function mapSampleToMouth(
  bs: number[],
  names?: string[]
): MouthShape {
  return mapBlendshapesToMouth(bsArrayToRecord(bs, names));
}

/**
 * Hysteresis: collapse runs of states shorter than minHoldMs into the
 * surrounding timeline so single-sample flicker disappears.
 */
export function smoothStates(
  samples: StateSample[],
  th: StateThresholds = DEFAULT_THRESHOLDS
): StateSample[] {
  if (samples.length <= 1) return [...samples];

  const runs: { state: SpriteState; start: number; end: number }[] = [];
  for (const s of samples) {
    const last = runs[runs.length - 1];
    if (last && last.state === s.state) {
      last.end = s.t;
    } else {
      runs.push({ state: s.state, start: s.t, end: s.t });
    }
  }

  const kept: typeof runs = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const dur = run.end - run.start;
    const hasPrev = kept.length > 0;
    const hasNext = i + 1 < runs.length;
    if (dur < th.minHoldMs && hasPrev && hasNext) continue; // flicker
    kept.push(run);
  }

  return kept.map((run) => ({ t: run.start, state: run.state }));
}

export interface BlendshapesFile {
  version: 1;
  approx_fps: number;
  /** Model category names for the positional scores (S3-04 decodes them). */
  names?: string[];
  samples: [number, ...number[]][];
  state_changes: [number, SpriteState][];
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function serializeBlendshapes(
  samples: BlendshapeSample[],
  th: StateThresholds = DEFAULT_THRESHOLDS,
  names?: string[]
): BlendshapesFile {
  const rounded = samples.map(
    (s) => [Math.round(s.t), ...s.bs.map(round3)] as [number, ...number[]]
  );

  const stateSamples: StateSample[] = samples.map((s) => ({
    t: Math.round(s.t),
    state: mapSampleToState(s.bs, th, names),
  }));
  const smoothed = smoothStates(stateSamples, th);

  let approxFps = 30;
  if (samples.length >= 2) {
    const deltas: number[] = [];
    for (let i = 1; i < samples.length; i++) {
      const d = samples[i].t - samples[i - 1].t;
      if (d > 0) deltas.push(d);
    }
    if (deltas.length > 0) {
      deltas.sort((a, b) => a - b);
      approxFps = Math.max(1, Math.round(1000 / deltas[Math.floor(deltas.length / 2)]));
    }
  }

  return {
    version: 1,
    approx_fps: approxFps,
    ...(names && names.length > 0 ? { names } : {}),
    samples: rounded,
    state_changes: smoothed.map((s) => [s.t, s.state] as [number, SpriteState]),
  };
}

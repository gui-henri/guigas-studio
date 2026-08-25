// Pure blendshape-to-sprite-state mapping (S2-03). No DOM, no network —
// reusable in the browser during recording and later in the render pipeline.
//
// Precedence (documented decision, tune via thresholds not ordering):
//   surprised > happy > thoughtful > talking > idle
// Clear expressions win over talking because talking is the base state while
// recording narration.

export type SpriteState = 'idle' | 'talking' | 'happy' | 'thoughtful' | 'surprised';

export interface StateThresholds {
  talkJawOpen: number;
  smile: number;
  surpriseBrow: number;
  thoughtfulBrowDown: number;
  gazeDown: number;
  minHoldMs: number;
}

export const DEFAULT_THRESHOLDS: StateThresholds = {
  talkJawOpen: 0.25,
  smile: 0.35,
  surpriseBrow: 0.45,
  thoughtfulBrowDown: 0.3,
  gazeDown: 0.3,
  minHoldMs: 150,
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
  'jawForward', 'jawOpen', 'jawLeft', 'jawRight', 'mouthClose',
  'mouthDimpleLeft', 'mouthDimpleRight', 'mouthFrownLeft', 'mouthFrownRight',
  'mouthFunnel', 'mouthLeft', 'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight',
] as const;

export const BLENDSHAPE_COUNT = 52;

/** Convert the positional array emitted by the worker into a named record.
 *  Unknown positions are ignored; mapped names must be within range. */
export function bsArrayToRecord(bs: number[]): Record<string, number> {
  const out: Record<string, number> = {};
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
  if ((bs.browInnerUp ?? 0) >= th.surpriseBrow) return 'surprised';
  if (maxOf(bs.mouthSmileLeft ?? 0, bs.mouthSmileRight ?? 0) >= th.smile) return 'happy';
  if (
    maxOf(bs.browDownLeft ?? 0, bs.browDownRight ?? 0) >= th.thoughtfulBrowDown ||
    maxOf(bs.eyeLookDownLeft ?? 0, bs.eyeLookDownRight ?? 0) >= th.gazeDown
  ) {
    return 'thoughtful';
  }
  if ((bs.jawOpen ?? 0) >= th.talkJawOpen) return 'talking';
  return 'idle';
}

export function mapSampleToState(
  bs: number[],
  th: StateThresholds = DEFAULT_THRESHOLDS
): SpriteState {
  return mapBlendshapesToState(bsArrayToRecord(bs), th);
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
  samples: [number, ...number[]][];
  state_changes: [number, SpriteState][];
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function serializeBlendshapes(
  samples: BlendshapeSample[],
  th: StateThresholds = DEFAULT_THRESHOLDS
): BlendshapesFile {
  const rounded = samples.map(
    (s) => [Math.round(s.t), ...s.bs.map(round3)] as [number, ...number[]]
  );

  const stateSamples: StateSample[] = samples.map((s) => ({
    t: Math.round(s.t),
    state: mapSampleToState(s.bs, th),
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
    samples: rounded,
    state_changes: smoothed.map((s) => [s.t, s.state] as [number, SpriteState]),
  };
}

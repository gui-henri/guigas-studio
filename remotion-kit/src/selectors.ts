// Pure timeline selectors (S3-07 step 1) — no React, fully deterministic.
// The structural TimelineView is satisfied by the generated proto Message
// AND by plain JSON fixtures; the rig never depends on either concretely.

export interface TimelineView {
  durationMs: number | bigint;
  mouthCues: Array<{ shape: string; startMs: number | bigint; endMs: number | bigint }>;
  bodyStates: Array<{ state: string; startMs: number | bigint; endMs: number | bigint }>;
}

export interface MouthCue {
  shape: string;
  startMs: number;
  endMs: number;
}

type RawCue = TimelineView["mouthCues"][number];

/** Cue active at ms; clamps to first/last at the edges. */
export function selectMouthCue(timeline: TimelineView, ms: number): MouthCue {
  const cues = timeline.mouthCues;
  if (cues.length === 0) return { shape: "X", startMs: 0, endMs: ms };
  const first = cues[0];
  if (ms < Number(first.startMs)) return cueOf(first);
  const last = cues[cues.length - 1];
  if (ms >= Number(last.endMs)) return cueOf(last);
  for (const c of cues) {
    if (ms >= Number(c.startMs) && ms < Number(c.endMs)) return cueOf(c);
  }
  return cueOf(last);
}

/** Body state active at ms; clamps to first/last at the edges. */
export function selectBodyState(
  timeline: Pick<TimelineView, "bodyStates">,
  ms: number
): string {
  const states = timeline.bodyStates;
  if (states.length === 0) return "idle";
  if (ms < Number(states[0].startMs)) return states[0].state;
  const last = states[states.length - 1];
  if (ms >= Number(last.endMs)) return last.state;
  for (const s of states) {
    if (ms >= Number(s.startMs) && ms < Number(s.endMs)) return s.state;
  }
  return last.state;
}

function cueOf(c: RawCue): MouthCue {
  return { shape: c.shape, startMs: Number(c.startMs), endMs: Number(c.endMs) };
}

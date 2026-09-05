// Pure timeline selectors (S3-07 step 1) — no React, fully deterministic.
// The structural TimelineView is satisfied by the generated proto Message
// AND by plain JSON fixtures; the rig never depends on either concretely.

export interface TimelineView {
  durationMs: number | bigint;
  mouthCues: Array<{ shape: string; startMs: number | bigint; endMs: number | bigint }>;
  bodyStates: Array<{ state: string; startMs: number | bigint; endMs: number | bigint }>;
  wordTimings?: Array<{ word: string; startMs: number | bigint; endMs: number | bigint }>;
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
  if (cues && cues.length > 0) {
    const hasActiveCues = cues.some((c) => c.shape && c.shape !== "X");
    if (hasActiveCues) {
      const first = cues[0];
      if (ms < Number(first.startMs)) return cueOf(first);
      const last = cues[cues.length - 1];
      if (ms >= Number(last.endMs)) return cueOf(last);
      for (const c of cues) {
        if (ms >= Number(c.startMs) && ms < Number(c.endMs)) return cueOf(c);
      }
      return cueOf(last);
    }
  }

  // Fallback: When mouthCues are missing or empty, synthesize natural speech
  // animation during the segment so the avatar narrates naturally.
  return fallbackMouthCue(timeline, ms);
}

function fallbackMouthCue(timeline: TimelineView, ms: number): MouthCue {
  const dur = Number(timeline.durationMs) || 0;
  if (ms < 0 || (dur > 0 && ms >= dur)) {
    return { shape: "X", startMs: ms, endMs: ms + 100 };
  }

  const words = timeline.wordTimings;
  if (words && words.length > 0) {
    const word = words.find((w) => ms >= Number(w.startMs) && ms < Number(w.endMs));
    if (!word) {
      return { shape: "X", startMs: ms, endMs: ms + 100 };
    }
    const shapes = ["A", "C", "E", "B"];
    const step = Math.floor((ms - Number(word.startMs)) / 120);
    return { shape: shapes[step % shapes.length], startMs: ms, endMs: ms + 120 };
  }

  // Syllable-based cadence: ~2.2s phrase, ~350ms breath pause
  const phraseCycle = ms % 2600;
  if (phraseCycle > 2200) {
    return { shape: "X", startMs: ms, endMs: ms + 100 };
  }
  const shapes = ["A", "B", "E", "C", "A", "X", "E", "A"];
  const step = Math.floor(phraseCycle / 140);
  return { shape: shapes[step % shapes.length], startMs: ms, endMs: ms + 140 };
}

/** Body state active at ms; clamps to first/last at the edges. */
export function selectBodyState(
  timeline: Pick<TimelineView, "bodyStates">,
  ms: number
): string {
  const states = timeline.bodyStates;
  if (states && states.length > 0) {
    const hasActiveStates = states.some((s) => s.state && s.state !== "idle");
    if (hasActiveStates) {
      if (ms < Number(states[0].startMs)) return states[0].state;
      const last = states[states.length - 1];
      if (ms >= Number(last.endMs)) return last.state;
      for (const s of states) {
        if (ms >= Number(s.startMs) && ms < Number(s.endMs)) return s.state;
      }
      return last.state;
    }
  }

  // Gentle default alternation between talking and idle during speech
  const phraseCycle = ms % 2600;
  return phraseCycle > 2200 ? "idle" : "falando";
}

function cueOf(c: RawCue): MouthCue {
  return { shape: c.shape, startMs: Number(c.startMs), endMs: Number(c.endMs) };
}

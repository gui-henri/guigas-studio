// Subtitle cue building (S4-06) — pure functions over the S3-05 word
// timings. No fetch, no frame access: cues are computed once per segment;
// the component only selects the active cue per frame.

export interface SubtitleWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface SubtitleCue {
  text: string;
  startFrame: number;
  endFrame: number; // exclusive
}

export interface BuildCuesOptions {
  fps: number;
  /** Max characters per line (default 42). */
  maxLineChars?: number;
  /** Max lines per cue — always 2 for burn-in. */
  maxLines?: number;
  /** Silence gap in ms that forces a new cue (default 350). */
  gapMs?: number;
}

const DEFAULT_MAX_LINE_CHARS = 42;
const DEFAULT_MAX_LINES = 2;
const DEFAULT_GAP_MS = 350;

/**
 * Groups words into cues:
 * - break on silence gaps longer than gapMs,
 * - never exceed maxLines lines of maxLineChars chars,
 * - words are never split or hyphenated; a word that does not fit starts a
 *   new cue,
 * - lines are balanced when a cue has two rows.
 */
export function buildCues(words: readonly SubtitleWord[], opts: BuildCuesOptions): SubtitleCue[] {
  const maxLineChars = opts.maxLineChars ?? DEFAULT_MAX_LINE_CHARS;
  const maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
  const gapMs = opts.gapMs ?? DEFAULT_GAP_MS;
  const { fps } = opts;

  const cues: SubtitleCue[] = [];
  let group: SubtitleWord[] = [];

  const flush = () => {
    if (group.length === 0) {
      return;
    }
    const text = group.map((w) => w.text).join(" ");
    const lines = wrapBalanced(text.split(" "), maxLineChars, maxLines);
    if (lines === null) {
      // Cannot fit within limits without splitting words → caller warned by
      // returning no cue for this group (never invents time).
      group = [];
      return;
    }
    cues.push({
      text: lines.join("\n"),
      startFrame: msToFrame(group[0].startMs, fps),
      endFrame: msToFrame(group[group.length - 1].endMs, fps),
    });
    group = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word.text.trim()) {
      continue; // whitespace-only entries carry no time information
    }
    if (
      !Number.isFinite(word.startMs) ||
      !Number.isFinite(word.endMs) ||
      word.startMs < 0 ||
      word.endMs <= word.startMs
    ) {
      // Missing/invalid timing: drop this word (with what was being grouped,
      // since its window is now unreliable) rather than inventing time.
      console.warn(
        `[subtitles] dropping word "${word.text}" — missing or invalid timing`
      );
      flush();
      continue;
    }

    if (group.length > 0) {
      const prev = group[group.length - 1];
      if (word.startMs - prev.endMs > gapMs) {
        flush();
      }
    }

    const candidate = [...group, word];
    const candidateText = candidate.map((w) => w.text).join(" ");
    if (
      fits(candidateText, maxLineChars, maxLines)
    ) {
      group = candidate;
    } else {
      // Word alone must fit, otherwise the cue is dropped with a warning.
      if (!fits(word.text, maxLineChars, maxLines)) {
        console.warn(
          `[subtitles] dropping word "${word.text}" — exceeds ${maxLineChars}x${maxLines} limit`
        );
        flush();
        continue;
      }
      flush();
      group = [word];
    }
  }
  flush();

  return cues;
}

/** Active cue at `frame` — start inclusive, end exclusive. */
export function selectCue(cues: readonly SubtitleCue[], frame: number): SubtitleCue | null {
  for (const cue of cues) {
    if (frame >= cue.startFrame && frame < cue.endFrame) {
      return cue;
    }
  }
  return null;
}

function fits(text: string, maxLineChars: number, maxLines: number): boolean {
  return wrapBalanced(text.split(" "), maxLineChars, maxLines) !== null;
}

/**
 * Greedy word wrap into ≤ maxLines lines of ≤ maxLineChars; when exactly the
 * last line wraps to 2, balance both. Returns null when impossible.
 */
function wrapBalanced(
  words: readonly string[],
  maxLineChars: number,
  maxLines: number
): string[] | null {
  const joined = words.join(" ");
  if (words.some((w) => w.length > maxLineChars)) {
    return null;
  }

  // Try balanced 2-line split first when content overflows one line.
  if (joined.length <= maxLineChars) {
    return [joined];
  }
  if (maxLines < 2) {
    return null;
  }

  // Greedy fill line 1 up to the limit; the rest must fit line 2.
  let splitAt = 0;
  let len = 0;
  for (let i = 0; i < words.length; i++) {
    const nextLen = len === 0 ? words[i].length : len + 1 + words[i].length;
    if (nextLen > maxLineChars) {
      break;
    }
    len = nextLen;
    splitAt = i + 1;
  }
  if (splitAt === 0 || splitAt === words.length) {
    return null;
  }

  if (words.slice(splitAt).join(" ").length > maxLineChars) {
    return null;
  }

  const joinRange = (from: number, to?: number) =>
    words.slice(from, to).join(" ");

  // Balance: move leading words of line 2 up while both lines keep fitting
  // and asymmetry shrinks.
  let best = splitAt;
  let bestDiff = Math.abs(
    joinRange(0, splitAt).length - joinRange(splitAt).length
  );
  for (let s = splitAt + 1; s <= words.length - 1; s++) {
    const l1 = joinRange(0, s);
    if (l1.length > maxLineChars) {
      break;
    }
    const l2 = joinRange(s);
    const diff = Math.abs(l1.length - l2.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    } else {
      break;
    }
  }

  return [joinRange(0, best), joinRange(best)];
}

function msToFrame(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

// Pure terminal reveal logic — a function of the frame only (no timers).
import type { TerminalLine } from "../schema";

/** Command lines type out at this fixed pace. */
export const TYPE_CHARS_PER_SECOND = 24;

export interface RenderedTerminalLine {
  kind: TerminalLine["kind"];
  prompt: boolean;
  text: string;
}

function commandDurationFrames(textLength: number, fps: number): number {
  return Math.ceil((textLength / TYPE_CHARS_PER_SECOND) * fps);
}

/**
 * Which terminal lines are visible at `frame`, including the partially typed
 * command line. Lines appear in order; each waits its own `delayFrames`
 * (accumulated), commands type out char-by-char, other kinds pop instantly.
 */
export function visibleTerminalLines(
  lines: readonly TerminalLine[],
  frame: number,
  fps: number
): RenderedTerminalLine[] {
  const out: RenderedTerminalLine[] = [];
  let cursor = 0;

  for (const line of lines) {
    cursor += line.delayFrames;
    if (frame < cursor) {
      break;
    }

    if (line.kind === "command") {
      const duration = commandDurationFrames(line.text.length, fps);
      const elapsed = frame - cursor;
      if (elapsed < duration) {
        const chars = Math.floor((elapsed / fps) * TYPE_CHARS_PER_SECOND);
        out.push({ kind: "command", prompt: true, text: line.text.slice(0, chars) });
        return out;
      }
    }

    out.push({ kind: line.kind, prompt: line.kind === "command", text: line.text });
  }

  return out;
}

/**
 * True while the LAST visible line is still typing — the blinking cursor
 * sits there. When everything finished, the cursor rests after the final
 * prompt-less output if `cursor` is on.
 */
export function isTyping(
  lines: readonly TerminalLine[],
  frame: number,
  fps: number
): boolean {
  let cursor = 0;
  for (const line of lines) {
    cursor += line.delayFrames;
    if (frame < cursor) {
      return false;
    }
    if (line.kind === "command") {
      const duration = commandDurationFrames(line.text.length, fps);
      if (frame - cursor < duration) {
        return true;
      }
      cursor += duration;
    }
  }
  return false;
}

// Pure [SHORT#n] extraction (S5-06) — mirrors the server-side counter but
// returns the full structure needed to render each vertical cut.

export interface ScriptSegmentLike {
  id: string;
  narration_pt?: string;
  scene?: unknown;
}

export interface ShortCut {
  /** 1-based sequential number of the short. */
  n: number;
  /** Segment ids whose narration carries this marker, in script order. */
  segmentIds: string[];
}

export interface ShortsPlan {
  cuts: ShortCut[];
  total: number;
}

/**
 * Extracts [SHORT#n] groups from script segments. Numbers must form the
 * sequence 1..N by first appearance — holes or reordering are errors
 * (the human approved THAT script; silently re-cutting is not an option).
 */
export function planShorts(segments: readonly ScriptSegmentLike[]): ShortsPlan {
  const order: number[] = [];
  const byNumber = new Map<number, string[]>();

  for (const seg of segments) {
    const text = seg.narration_pt ?? "";
    const matches = text.matchAll(/\[SHORT#(\d+)\]/g);
    const seenInSeg = new Set<string>();
    for (const m of matches) {
      const n = Number(m[1]);
      if (!byNumber.has(n)) {
        byNumber.set(n, []);
        order.push(n);
      }
      // A single segment mentioning the same marker twice still counts once.
      const key = `${n}:${seg.id}`;
      if (!seenInSeg.has(key)) {
        seenInSeg.add(key);
        byNumber.get(n)!.push(seg.id);
      }
    }
  }

  const problems: string[] = [];
  order.forEach((n, index) => {
    if (n !== index + 1) {
      problems.push(
        `marker [SHORT#${n}] found where [SHORT#${index + 1}] was expected`
      );
    }
  });
  if (problems.length > 0) {
    throw new Error(`short markers out of sequence: ${problems.join("; ")}`);
  }

  return {
    cuts: order.map((n) => ({ n, segmentIds: byNumber.get(n)! })),
    total: order.length,
  };
}

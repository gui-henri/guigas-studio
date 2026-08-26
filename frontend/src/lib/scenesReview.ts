// Pure review-state helpers (S4-08) — unit-tested, no React.
export interface SceneCardDecision {
  decision: "approved" | "rejected";
  comment?: string;
  decidedAt: string; // ISO
}

export type SceneCardState = {
  segmentId: string;
  sceneType: string | null;
} & Partial<SceneCardDecision>;

export interface ReviewProgress {
  approved: number;
  total: number;
  isComplete: boolean;
}

/**
 * Counts approvals over the full card list. Cards without a decision are
 * neither approved nor rejected — they simply keep isComplete false.
 */
export function reviewProgress(
  cards: ReadonlyArray<{ segmentId: string; decision?: string }>
): ReviewProgress {
  const total = cards.length;
  const approved = cards.filter((c) => c.decision === "approved").length;
  return { approved, total, isComplete: total > 0 && approved === total };
}

/** Draft storage key: decisions survive reloads per slug + script version. */
export function draftKey(slug: string, scriptVersion: string | number): string {
  return `guigas.scenes-review.${slug}.v${scriptVersion}`;
}

export function loadDecisions(key: string): Record<string, SceneCardDecision> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SceneCardDecision>;
  } catch {
    return {};
  }
}

export function saveDecisions(
  key: string,
  decisions: Record<string, SceneCardDecision>
): void {
  localStorage.setItem(key, JSON.stringify(decisions));
}

const CATALOG_URL =
  "https://github.com/gui-henri/guigas-studio/blob/main/docs/guides/scene-catalog.md";

/** Copy-paste prompt for the OpenCode conversational fix loop (S4-10). */
export function buildFixPrompt(input: {
  slug: string;
  segmentId: string;
  sceneType: string | null;
  comment: string;
}): string {
  const target = input.sceneType ?? "só-avatar";
  return [
    `Corrija a cena do segmento "${input.segmentId}" do vídeo "${input.slug}".`,
    `Cena atual: ${target}`,
    "",
    `Feedback da revisão: ${input.comment}`,
    "",
    "Regras: use apenas tipos e props da gramática fechada",
    `(docs/guides/scene-catalog.md). Depois de reescrever script.json, leia`,
    ".validation-latest.json e confirme que \"valid\" é true.",
  ].join("\n");
}

export { CATALOG_URL };

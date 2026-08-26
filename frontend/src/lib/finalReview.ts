// Pure formatting/deviation helpers for the final review page (S5-10).

export interface DurationDeviation {
  label: "no alvo" | "±Xs do alvo";
  tone: "ok" | "warn" | "danger";
  detail: string;
}

/**
 * Compares the rendered long duration against the approved target.
 * ≤60 s of deviation → ok, ≤180 s → warn, beyond → danger.
 * Never blocks approval — human guidance only.
 */
export function durationDeviation(
  durationS: number,
  targetMin: number | null | undefined
): DurationDeviation | null {
  if (!targetMin || targetMin <= 0) return null;
  const targetS = targetMin * 60;
  const diff = Math.round(Math.abs(durationS - targetS));
  const tone: DurationDeviation["tone"] =
    diff <= 60 ? "ok" : diff <= 180 ? "warn" : "danger";
  return {
    label: diff === 0 ? "no alvo" : "±Xs do alvo",
    tone,
    detail: `${diff}s do alvo de ${targetMin} min`,
  };
}

/** 83.4 s → "01:23". */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "--:--";
  const s = Math.round(totalSeconds);
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Human-readable MB with one decimal. */
export function formatMB(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

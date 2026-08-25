import { Beat, Emotion } from "../../gen/app/studio/v1/script_pb";
import type { Segment } from "../../gen/app/studio/v1/script_pb";

const beatLabels: Partial<Record<Beat, string>> = {
  [Beat.HOOK]: "Hook",
  [Beat.SETUP]: "Setup",
  [Beat.EXAMPLE]: "Exemplo",
  [Beat.PAYOFF]: "Payoff",
  [Beat.CTA]: "CTA",
};

const emotionLabels: Partial<Record<Emotion, string>> = {
  [Emotion.IDLE]: "Idle",
  [Emotion.SPEAKING]: "Falando",
  [Emotion.HAPPY]: "Feliz",
  [Emotion.THOUGHTFUL]: "Pensativo",
  [Emotion.SURPRISED]: "Surpreso",
};

export const BEAT_OPTIONS: Beat[] = [
  Beat.HOOK,
  Beat.SETUP,
  Beat.EXAMPLE,
  Beat.PAYOFF,
  Beat.CTA,
];

export const EMOTION_OPTIONS: Emotion[] = [
  Emotion.IDLE,
  Emotion.SPEAKING,
  Emotion.HAPPY,
  Emotion.THOUGHTFUL,
  Emotion.SURPRISED,
];

export function beatLabel(beat: Beat): string {
  return beatLabels[beat] ?? `beat ${beat}`;
}

export function emotionLabel(emotion: Emotion): string {
  return emotionLabels[emotion] ?? `emotion ${emotion}`;
}

export interface SegmentErrors {
  narration?: string;
  shortHook?: string;
  shortCta?: string;
}

export default function SegmentCard({
  segment,
  changed,
  editing,
  errors,
  onChange,
}: {
  segment: Segment;
  changed?: boolean;
  editing?: boolean;
  errors?: SegmentErrors;
  onChange?: (segment: Segment) => void;
}) {
  const readOnly = !editing || !onChange;

  return (
    <article
      id={`segment-${segment.id}`}
      className={`rounded-lg border bg-white p-5 shadow-sm scroll-mt-20 ${
        changed ? "border-accent" : "border-ink/10"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink/50">{segment.id}</span>
        {readOnly ? (
          <>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800">
              {beatLabel(segment.beat)}
            </span>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs text-teal-800">
              {emotionLabel(segment.emotion)}
            </span>
            {segment.scene && (
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs text-violet-800">
                cena: {segment.scene.type}
              </span>
            )}
            {segment.short && (
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-accent">
                [SHORT#{segment.short.id}] {segment.short.hook} → {segment.short.cta}
              </span>
            )}
          </>
        ) : (
          <>
            <select
              aria-label="Beat"
              value={segment.beat}
              onChange={(e) =>
                onChange({ ...segment, beat: Number(e.target.value) as Beat })
              }
              className="rounded border border-ink/20 px-2 py-1 text-xs"
            >
              {BEAT_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {beatLabel(b)}
                </option>
              ))}
            </select>
            <select
              aria-label="Emoção"
              value={segment.emotion}
              onChange={(e) =>
                onChange({ ...segment, emotion: Number(e.target.value) as Emotion })
              }
              className="rounded border border-ink/20 px-2 py-1 text-xs"
            >
              {EMOTION_OPTIONS.map((em) => (
                <option key={em} value={em}>
                  {emotionLabel(em)}
                </option>
              ))}
            </select>
          </>
        )}
      </header>

      {readOnly ? (
        <p className="mt-3 font-serif text-lg leading-relaxed">{segment.narrationPt}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <textarea
              aria-label={`Narração de ${segment.id}`}
              value={segment.narrationPt}
              rows={4}
              onChange={(e) => onChange?.({ ...segment, narrationPt: e.target.value })}
              className="w-full rounded border border-ink/20 p-3 font-serif text-base leading-relaxed focus:border-ink focus:outline-none"
            />
            {errors?.narration && (
              <p className="mt-1 text-xs text-red-700">{errors.narration}</p>
            )}
          </div>
          {segment.short && (
            <div className="grid gap-2 rounded border border-accent/30 bg-accent/5 p-3 sm:grid-cols-2">
              <label className="text-xs text-accent">
                Short hook
                <input
                  value={segment.short.hook}
                  onChange={(e) =>
                    onChange?.({
                      ...segment,
                      short: { ...segment.short!, hook: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded border border-accent/30 px-2 py-1 text-sm text-ink"
                />
                {errors?.shortHook && (
                  <span className="mt-1 block text-red-700">{errors.shortHook}</span>
                )}
              </label>
              <label className="text-xs text-accent">
                CTA do short
                <input
                  value={segment.short.cta}
                  onChange={(e) =>
                    onChange?.({
                      ...segment,
                      short: { ...segment.short!, cta: e.target.value },
                    })
                  }
                  className="mt-1 w-full rounded border border-accent/30 px-2 py-1 text-sm text-ink"
                />
                {errors?.shortCta && (
                  <span className="mt-1 block text-red-700">{errors.shortCta}</span>
                )}
              </label>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

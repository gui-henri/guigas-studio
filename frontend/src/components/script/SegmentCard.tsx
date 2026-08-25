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

export function beatLabel(beat: Beat): string {
  return beatLabels[beat] ?? `beat ${beat}`;
}

export function emotionLabel(emotion: Emotion): string {
  return emotionLabels[emotion] ?? `emotion ${emotion}`;
}

export default function SegmentCard({
  segment,
  changed,
}: {
  segment: Segment;
  changed?: boolean;
}) {
  return (
    <article
      id={`segment-${segment.id}`}
      className={`rounded-lg border bg-white p-5 shadow-sm scroll-mt-20 ${
        changed ? "border-accent" : "border-ink/10"
      }`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-ink/50">{segment.id}</span>
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
      </header>
      <p className="mt-3 font-serif text-lg leading-relaxed">{segment.narrationPt}</p>
    </article>
  );
}

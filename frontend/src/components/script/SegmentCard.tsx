import { Beat, Emotion } from "../../gen/app/studio/v1/script_pb";
import type { Segment } from "../../gen/app/studio/v1/script_pb";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { cn } from "@/lib/utils";

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
    <Card
      id={`segment-${segment.id}`}
      className={cn("scroll-mt-20", changed && "border-ring")}
    >
      <CardHeader className="flex-row flex-wrap items-center gap-2 space-y-0">
        <span className="font-mono text-xs text-muted-foreground">{segment.id}</span>
        {readOnly ? (
          <>
            <Badge variant="default">
              {beatLabel(segment.beat)}
            </Badge>
            <Badge variant="secondary">
              {emotionLabel(segment.emotion)}
            </Badge>
            {segment.scene && (
              <Badge variant="outline">
                cena: {segment.scene.type}
              </Badge>
            )}
            {segment.short && (
              <Badge variant="accent">
                [SHORT#{segment.short.id}] {segment.short.hook} → {segment.short.cta}
              </Badge>
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
              className="h-8 rounded-md border border-input bg-card px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="h-8 rounded-md border border-input bg-card px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {EMOTION_OPTIONS.map((em) => (
                <option key={em} value={em}>
                  {emotionLabel(em)}
                </option>
              ))}
            </select>
          </>
        )}
      </CardHeader>

      <CardContent>
      {readOnly ? (
        <p className="font-display text-lg leading-relaxed">{segment.narrationPt}</p>
      ) : (
        <div className="space-y-3">
          <div>
            <Textarea
              aria-label={`Narração de ${segment.id}`}
              value={segment.narrationPt}
              rows={4}
              onChange={(e) => onChange?.({ ...segment, narrationPt: e.target.value })}
              className="font-display text-base leading-relaxed"
            />
            {errors?.narration && (
              <p className="mt-1 text-xs text-destructive">{errors.narration}</p>
            )}
          </div>
          {segment.short && (
            <div className="grid gap-2 rounded-md border border-ring/30 bg-muted p-3 sm:grid-cols-2">
              <Label className="text-xs text-accent">
                Short hook
                <Input
                  value={segment.short.hook}
                  onChange={(e) =>
                    onChange?.({
                      ...segment,
                      short: { ...segment.short!, hook: e.target.value },
                    })
                  }
                  className="mt-1 text-sm"
                />
                {errors?.shortHook && (
                  <span className="mt-1 block text-destructive">{errors.shortHook}</span>
                )}
              </Label>
              <Label className="text-xs text-accent">
                CTA do short
                <Input
                  value={segment.short.cta}
                  onChange={(e) =>
                    onChange?.({
                      ...segment,
                      short: { ...segment.short!, cta: e.target.value },
                    })
                  }
                  className="mt-1 text-sm"
                />
                {errors?.shortCta && (
                  <span className="mt-1 block text-destructive">{errors.shortCta}</span>
                )}
              </Label>
            </div>
          )}
        </div>
      )}
      </CardContent>
    </Card>
  );
}

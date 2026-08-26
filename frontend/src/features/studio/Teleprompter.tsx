import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export interface TeleprompterProps {
  segmentId: string;
  narration: string;
  onTakeReady?: (take: { wavBlob: Blob; durationMs: number }) => void;
  onNext?: () => void;
  onPrev?: () => void;
  renderExtra?: ReactNode;
}

export default function Teleprompter({
  segmentId,
  narration,
  onNext,
  onPrev,
  renderExtra,
}: TeleprompterProps) {
  const [fontSize, setFontSize] = useState<"md" | "lg" | "xl">("lg");

  const fontClasses = {
    md: "text-xl leading-relaxed",
    lg: "text-2xl leading-relaxed font-serif",
    xl: "text-3xl leading-loose font-serif",
  };

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext?.();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNext, onPrev]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-ink/50">segmento: {segmentId}</span>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-ink/40 mr-1">Tamanho:</span>
          <button
            type="button"
            onClick={() => setFontSize("md")}
            className={`rounded px-2 py-0.5 ${
              fontSize === "md" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            A
          </button>
          <button
            type="button"
            onClick={() => setFontSize("lg")}
            className={`rounded px-2 py-0.5 text-sm ${
              fontSize === "lg" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            A+
          </button>
          <button
            type="button"
            onClick={() => setFontSize("xl")}
            className={`rounded px-2 py-0.5 text-base font-bold ${
              fontSize === "xl" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            A++
          </button>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-xl border border-ink/10 bg-white p-6 shadow-sm">
        <p className={`${fontClasses[fontSize]} text-neutral-900 selection:bg-amber-100`}>
          {narration}
        </p>
      </div>

      {renderExtra}
    </div>
  );
}

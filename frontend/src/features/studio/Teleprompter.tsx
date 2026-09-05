import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Card, CardContent } from "../../components/ui/card";
import { cn } from "@/lib/utils";

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
    md: "text-lg leading-relaxed",
    lg: "text-xl sm:text-2xl leading-relaxed font-display",
    xl: "text-2xl sm:text-3xl leading-loose font-display",
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-foreground">
            segmento: <span className="text-accent">{segmentId}</span>
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground/70">
            • <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">←</kbd>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">→</kbd>
            <span>navegar</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground text-[11px]">Tamanho:</span>
          <div className="flex items-center rounded-lg border border-border bg-muted/60 p-0.5">
            <button
              type="button"
              onClick={() => setFontSize("md")}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                fontSize === "md"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              A
            </button>
            <button
              type="button"
              onClick={() => setFontSize("lg")}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                fontSize === "lg"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              A+
            </button>
            <button
              type="button"
              onClick={() => setFontSize("xl")}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                fontSize === "xl"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              A++
            </button>
          </div>
        </div>
      </div>

      <Card className="border-border shadow-xs">
        <CardContent className="max-h-72 overflow-y-auto p-5 sm:p-6">
          <p className={cn(fontClasses[fontSize], "text-foreground selection:bg-accent/20")}>
            {narration}
          </p>
        </CardContent>
      </Card>

      {renderExtra}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "../../components/ui/button";
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
    md: "text-xl leading-relaxed",
    lg: "text-2xl leading-relaxed font-display",
    xl: "text-3xl leading-loose font-display",
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
        <span className="font-mono text-xs text-muted-foreground">segmento: {segmentId}</span>
        <div className="flex items-center gap-1 text-xs">
          <span className="mr-1 text-muted-foreground">Tamanho:</span>
          <Button
            type="button"
            variant={fontSize === "md" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFontSize("md")}
            className="h-7 px-2"
          >
            A
          </Button>
          <Button
            type="button"
            variant={fontSize === "lg" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFontSize("lg")}
            className="h-7 px-2 text-sm"
          >
            A+
          </Button>
          <Button
            type="button"
            variant={fontSize === "xl" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFontSize("xl")}
            className="h-7 px-2 text-base font-bold"
          >
            A++
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className={cn("max-h-72 overflow-y-auto p-6")}>
          <p className={cn(fontClasses[fontSize], "selection:bg-accent/20")}>
            {narration}
          </p>
        </CardContent>
      </Card>

      {renderExtra}
    </div>
  );
}

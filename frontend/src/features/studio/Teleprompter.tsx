import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { startMicCapture } from "../../audio/micCapture";
import type { MicCapture } from "../../audio/micCapture";
import { useLocalTake } from "./useLocalTake";
import Waveform from "./Waveform";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";

export interface TeleprompterProps {
  segmentId: string;
  narration: string;
  onTakeReady?: (take: { wavBlob: Blob; durationMs: number }) => void;
  onNext?: () => void;
  onPrev?: () => void;
  renderExtra?: ReactNode;
}

/**
 * Recording teleprompter: big scrollable serif narration, record/stop/redo
 * with keyboard shortcuts, instant replay with waveform. Nothing leaves the
 * browser here — upload is the caller's job (S2-07).
 */
export default function Teleprompter({
  segmentId,
  narration,
  onTakeReady,
  onNext,
  onPrev,
  renderExtra,
}: TeleprompterProps) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [silence, setSilence] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef<MicCapture | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { take, replace, reset } = useLocalTake();

  const stopAndKeep = useCallback(async () => {
    if (!captureRef.current) return;
    const capture = captureRef.current;
    captureRef.current = null;
    setRecording(false);
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      const result = await capture.stop();
      replace(result.blob, Math.round(result.durationMs));
      onTakeReady?.({ wavBlob: result.blob, durationMs: Math.round(result.durationMs) });
    } catch (err: unknown) {
      setError(String((err as Error).message ?? err));
    }
  }, [onTakeReady, replace]);

  const beginRecording = useCallback(() => {
    if (recording) return;
    setError(null);
    setSilence(false);
    reset();
    startMicCapture({
      onLevel: () => {}, // meter lives in the dev page; keep recording lean here
      onSilenceWarning: () => setSilence(true),
    })
      .then((capture) => {
        captureRef.current = capture;
        startedAtRef.current = performance.now();
        setElapsedMs(0);
        setRecording(true);
        timerRef.current = setInterval(
          () => setElapsedMs(performance.now() - startedAtRef.current),
          100
        );
      })
      .catch((err: unknown) => setError(String((err as Error).message ?? err)));
  }, [recording, reset]);

  const toggleRecording = useCallback(() => {
    if (recording) void stopAndKeep();
    else beginRecording();
  }, [recording, stopAndKeep, beginRecording]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
        return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleRecording();
      } else if (e.key.toLowerCase() === "r" && !recording && take) {
        // Redo = discard local take; next recording starts fresh.
        reset();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!recording) onNext?.();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!recording) onPrev?.();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleRecording, recording, take, reset, onNext, onPrev]);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs text-muted-foreground">segmento: {segmentId}</span>
        {take && (
          <span className="text-xs text-muted-foreground">
            take #{take.takeNumber} · {(take.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <Card>
        <CardContent className="max-h-64 overflow-y-auto p-6">
          <p className="font-display text-2xl leading-relaxed">{narration}</p>
        </CardContent>
      </Card>

      {silence && (
        <Alert>
          <AlertDescription>
            Silêncio detectado há mais de 2 s — o clipe pode estar mudo.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={recording ? "destructive" : "accent"}
          onClick={toggleRecording}
        >
          {recording ? `Parar (${(elapsedMs / 1000).toFixed(1)}s)` : "Gravar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={recording || !take}
          onClick={() => reset()}
          title="Refazer (descarta o take atual)"
        >
          Refazer
        </Button>
        <span className="text-xs text-muted-foreground">
          Space grava/para · R refaz · ←/→ navega
        </span>
      </div>

      {renderExtra}

      {take && !recording && (
        <section aria-label="Replay do take">
          <Waveform audioUrl={take.blobUrl} />
        </section>
      )}
    </div>
  );
}

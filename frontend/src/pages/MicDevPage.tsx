import { useCallback, useRef, useState } from "react";

import LevelMeter from "../components/LevelMeter";
import { startMicCapture } from "../audio/micCapture";
import type { MicCapture } from "../audio/micCapture";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

/** Dev-only page: mic capture with level meter and test WAV download. */
export default function MicDevPage() {
  const captureRef = useRef<MicCapture | null>(null);
  const levelFnRef = useRef<((dbfs: number) => void) | null>(null);
  const [recording, setRecording] = useState(false);
  const [silence, setSilence] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registerLevel = useCallback((fn: (dbfs: number) => void) => {
    levelFnRef.current = fn;
  }, []);

  async function toggle() {
    if (recording) {
      const result = await captureRef.current!.stop();
      captureRef.current = null;
      setRecording(false);
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      const url = URL.createObjectURL(result.blob);
      setDownloadUrl(url);
      setDuration(Math.round(result.durationMs));
      return;
    }
    try {
      setError(null);
      setSilence(false);
      const capture = await startMicCapture({
        onLevel: (dbfs) => levelFnRef.current?.(dbfs),
        onSilenceWarning: () => setSilence(true),
      });
      captureRef.current = capture;
      setRecording(true);
    } catch (err: unknown) {
      setError(String((err as Error).message ?? err));
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <Card>
        <CardHeader>
          <CardTitle>Captura de voz — dev</CardTitle>
          <p className="text-sm text-muted-foreground">
            WAV 48 kHz mono 16-bit · silêncio &gt; 2 s dispara aviso único.{" "}
            {recording && <Badge variant="secondary">gravando…</Badge>}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {silence && (
            <Alert>
              <AlertDescription>
                Silêncio detectado por mais de 2 s — microfone aberto?
              </AlertDescription>
            </Alert>
          )}

          <LevelMeter registerLevel={registerLevel} />

          <Button
            type="button"
            variant="accent"
            onClick={() => void toggle()}
            disabled={!!error && !recording}
          >
            {recording ? "Parar e gerar WAV" : "Gravar"}
          </Button>

          {downloadUrl && duration !== null && (
            <p className="text-sm text-muted-foreground">
              <Button variant="link" asChild className="h-auto p-0">
                <a href={downloadUrl} download="test.wav">
                  Baixar test.wav
                </a>
              </Button>{" "}
              ({duration} ms)
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useCallback, useRef, useState } from "react";

import LevelMeter from "../components/LevelMeter";
import { startMicCapture } from "../audio/micCapture";
import type { MicCapture } from "../audio/micCapture";

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
      <h1 className="font-serif text-2xl font-semibold">Captura de voz — dev</h1>
      <p className="text-sm text-ink/60">
        WAV 48 kHz mono 16-bit · silêncio &gt; 2 s dispara aviso único.
      </p>
      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</p>
      )}
      {silence && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          Silêncio detectado por mais de 2 s — microfone aberto?
        </p>
      )}

      <LevelMeter registerLevel={registerLevel} />

      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!!error && !recording}
        className="rounded bg-accent px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-40"
      >
        {recording ? "Parar e gerar WAV" : "Gravar"}
      </button>

      {downloadUrl && duration !== null && (
        <p className="text-sm">
          <a href={downloadUrl} download="test.wav" className="text-accent underline">
            Baixar test.wav
          </a>{" "}
          ({duration} ms)
        </p>
      )}
    </div>
  );
}

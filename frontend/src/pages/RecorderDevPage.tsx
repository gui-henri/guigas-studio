import { useEffect, useRef, useState } from "react";

import LiveAvatar from "../components/LiveAvatar";
import Teleprompter from "../features/studio/Teleprompter";
import { useSegmentRecorder } from "../features/studio/useSegmentRecorder";

const PHASE_LABEL: Record<string, string> = {
  idle: "pronto",
  recording: "gravando…",
  encoding: "codificando…",
  uploading: "subindo…",
  done: "concluído",
  error: "erro (par local mantido)",
};

/** Dev-only page exercising the full segment recording orchestration (S2-07). */
export default function RecorderDevPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [slug, setSlug] = useState("demo-slug");
  const [segmentId, setSegmentId] = useState("hook");

  const recorder = useSegmentRecorder(slug, segmentId, videoRef, streamRef);

  useEffect(() => {
    if (!cameraReady) return;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
      })
      .catch(() => setCameraReady(false));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraReady]);

  const busy = recorder.phase === "recording" || recorder.phase === "encoding" || recorder.phase === "uploading";

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="font-serif text-2xl font-semibold">Gravador de segmento — dev</h1>
      <p className="text-sm text-ink/60">
        fase: {PHASE_LABEL[recorder.phase] ?? recorder.phase}
        {recorder.phase === "uploading" && ` (${Math.round(recorder.progress * 100)}%)`} ·
        landmarker: {recorder.delegate ?? "?"} @ {recorder.fps}fps
      </p>
      {(recorder.error || !cameraReady) && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {recorder.error ?? "ligue a câmera para gravar"}
        </p>
      )}
      {recorder.localPair && (
        <button
          type="button"
          onClick={() => void recorder.retryUploads()}
          className="rounded border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent/10"
        >
          Reenviar par local
        </button>
      )}

      {!cameraReady ? (
        <button
          type="button"
          onClick={() => setCameraReady(true)}
          className="rounded bg-accent px-4 py-2 text-sm text-paper hover:opacity-90"
        >
          Ligar câmera
        </button>
      ) : (
        <>
          <div className="flex items-start gap-4">
            <LiveAvatar stateRef={recorder.stateRef} scale={240} />
            <video ref={videoRef} muted playsInline className="w-40 rounded border border-ink/10" />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>
              slug do vídeo
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded border border-ink/20 px-2 py-1 font-mono text-xs"
              />
            </label>
            <label>
              segment_id
              <input
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded border border-ink/20 px-2 py-1 font-mono text-xs"
              />
            </label>
          </div>

          <Teleprompter
            segmentId={segmentId}
            narration="Leia este texto enquanto o avatar reage. O take sobe automaticamente ao parar."
            renderExtra={
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || !cameraReady}
                  onClick={() => void recorder.start()}
                  className="rounded bg-accent px-4 py-2 text-sm text-paper hover:opacity-90 disabled:opacity-40"
                >
                  Gravar sincronizado
                </button>
                <button
                  type="button"
                  disabled={!busy}
                  onClick={() => void recorder.stop()}
                  className="rounded bg-red-700 px-4 py-2 text-sm text-white hover:bg-red-800 disabled:opacity-40"
                >
                  Parar e subir
                </button>
              </div>
            }
          />
        </>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

import { useFaceLandmarker } from "../recording/useFaceLandmarker";

/** Dev-only smoke page: webcam + live blendshape FPS HUD (S2-02). */
export default function LandmarkerDevPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [running, setRunning] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const onSamples = () => setBatchCount((n) => n + 1);
  const landmarker = useFaceLandmarker(videoRef, onSamples);

  useEffect(() => {
    if (!running) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { width: 640, height: 480 }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
          landmarker.start(performance.now());
        }
      })
      .catch((err: unknown) => setCameraError(String(err)));

    return () => {
      cancelled = true;
      landmarker.stop();
      stream?.getTracks().forEach((tr) => tr.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="font-serif text-2xl font-semibold">Face Landmarker — dev HUD</h1>
      <p className="mt-1 text-sm text-ink/60">
        delegate: {landmarker.delegate ?? "inicializando…"} · fps: {landmarker.fps} ·
        lotes recebidos: {batchCount}
      </p>
      {(landmarker.error || cameraError) && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {cameraError ?? landmarker.error}
        </p>
      )}
      <div className="mt-4 overflow-hidden rounded-lg border border-ink/10">
        <video ref={videoRef} muted playsInline className="w-full" />
      </div>
      <button
        type="button"
        onClick={() => setRunning((r) => !r)}
        className="mt-4 rounded bg-accent px-4 py-2 text-sm text-paper hover:opacity-90"
      >
        {running ? "Parar" : "Iniciar câmera"}
      </button>
    </div>
  );
}

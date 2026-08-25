import { useEffect, useRef, useState } from "react";

import LiveAvatar from "../components/LiveAvatar";
import { useFaceLandmarker } from "../recording/useFaceLandmarker";
import type { SpriteState } from "../recording/stateMapping";

/** Dev-only page: live avatar driven by the face landmarker or demo cycle. */
export default function AvatarDevPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [mirror, setMirror] = useState(true);
  const [scale, setScale] = useState(320);
  const [demo, setDemo] = useState(true);
  const stateRef = useRef<SpriteState>("idle");
  const [detected] = useState<SpriteState>("idle");

  // Derive a coarse state from the last blendshape batch (S2-03 mapping).
  const onSamples = (batch: { t: number; bs: number[] }[]) => {
    if (batch.length === 0) return;
    void batch; // state derivation happens in S2-06 recording flow; here we
    // keep the demo/manual control as the source of truth for simplicity.
  };
  useFaceLandmarker(videoRef, onSamples);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (cameraOn) {
      navigator.mediaDevices
        .getUserMedia({ video: true, audio: false })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            void videoRef.current.play();
          }
        })
        .catch(() => setCameraOn(false));
    }
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn]);

  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="font-serif text-2xl font-semibold">LiveAvatar — dev</h1>
      <p className="text-sm text-ink/60">
        estado atual (demo): <span className="font-mono">{demo ? "ciclando" : detected}</span>
      </p>

      <LiveAvatar stateRef={stateRef} mirror={mirror} scale={scale} demo={demo} />

      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
          Espelhar
        </label>
        <label className="flex items-center gap-2">
          Demo (ciclar 5 estados)
          <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
        </label>
        <label className="block">
          Escala: {scale}px
          <input
            type="range"
            min={240}
            max={720}
            step={20}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="ml-2 w-64 align-middle"
          />
        </label>
        <button
          type="button"
          onClick={() => setCameraOn((v) => !v)}
          className="rounded bg-accent px-3 py-1.5 text-xs text-paper hover:opacity-90"
        >
          {cameraOn ? "Desligar câmera" : "Ligar câmera"}
        </button>
      </div>

      <video ref={videoRef} muted playsInline className="w-48 rounded border border-ink/10" />
    </div>
  );
}

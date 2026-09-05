import { useEffect, useRef, useState } from "react";

import { useFaceLandmarker } from "../recording/useFaceLandmarker";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

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
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <Card>
        <CardHeader>
          <CardTitle>Face Landmarker — dev HUD</CardTitle>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              delegate: <Badge variant="secondary">{landmarker.delegate ?? "inicializando…"}</Badge>
            </span>
            <span>
              fps: <Badge variant="secondary">{landmarker.fps}</Badge>
            </span>
            <span>
              lotes recebidos: <Badge variant="secondary">{batchCount}</Badge>
            </span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(landmarker.error || cameraError) && (
            <Alert variant="destructive">
              <AlertDescription>{cameraError ?? landmarker.error}</AlertDescription>
            </Alert>
          )}
          <div className="overflow-hidden rounded-lg border border-border">
            <video ref={videoRef} muted playsInline className="w-full" />
          </div>
          <Button type="button" variant="accent" onClick={() => setRunning((r) => !r)}>
            {running ? "Parar" : "Iniciar câmera"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

import LiveAvatar from "../components/LiveAvatar";
import { useFaceLandmarker } from "../recording/useFaceLandmarker";
import type { SpriteState } from "../recording/stateMapping";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

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
      <Card>
        <CardHeader>
          <CardTitle>LiveAvatar — dev</CardTitle>
          <p className="text-sm text-muted-foreground">
            estado atual (demo):{" "}
            <Badge variant="secondary" className="font-mono">
              {demo ? "ciclando" : detected}
            </Badge>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <LiveAvatar stateRef={stateRef} mirror={mirror} scale={scale} demo={demo} />

          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <Input
                id="avatar-mirror"
                type="checkbox"
                checked={mirror}
                onChange={(e) => setMirror(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="avatar-mirror">Espelhar</Label>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="avatar-demo"
                type="checkbox"
                checked={demo}
                onChange={(e) => setDemo(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="avatar-demo">Demo (ciclar 5 estados)</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar-scale">Escala: {scale}px</Label>
              <Input
                id="avatar-scale"
                type="range"
                min={240}
                max={720}
                step={20}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="ml-2 h-auto w-64"
              />
            </div>
            <Button type="button" variant="accent" size="sm" onClick={() => setCameraOn((v) => !v)}>
              {cameraOn ? "Desligar câmera" : "Ligar câmera"}
            </Button>
          </div>

          <video ref={videoRef} muted playsInline className="w-48 rounded border border-border" />
        </CardContent>
      </Card>
    </div>
  );
}

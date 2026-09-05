import { useEffect, useRef, useState } from "react";

import LiveAvatar from "../components/LiveAvatar";
import Teleprompter from "../features/studio/Teleprompter";
import { useSegmentRecorder } from "../features/studio/useSegmentRecorder";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

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
      <Card>
        <CardHeader>
          <CardTitle>Gravador de segmento — dev</CardTitle>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              fase: <Badge variant="secondary">{PHASE_LABEL[recorder.phase] ?? recorder.phase}</Badge>
            </span>
            {recorder.phase === "uploading" && (
              <Badge variant="secondary">{Math.round(recorder.progress * 100)}%</Badge>
            )}
            <span>
              landmarker: <Badge variant="secondary">{recorder.delegate ?? "?"} @ {recorder.fps}fps</Badge>
            </span>
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(recorder.error || !cameraReady) && (
            <Alert variant="destructive">
              <AlertDescription>{recorder.error ?? "ligue a câmera para gravar"}</AlertDescription>
            </Alert>
          )}
          {recorder.localPair && (
            <Button type="button" variant="outline" size="sm" onClick={() => void recorder.retryUploads()}>
              Reenviar par local
            </Button>
          )}

          {!cameraReady ? (
            <Button type="button" variant="accent" onClick={() => setCameraReady(true)}>
              Ligar câmera
            </Button>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <LiveAvatar stateRef={recorder.stateRef} scale={240} />
                <video ref={videoRef} muted playsInline className="w-40 rounded border border-border" />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-2">
                  <Label htmlFor="recorder-slug">slug do vídeo</Label>
                  <Input
                    id="recorder-slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    disabled={busy}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recorder-segment">segment_id</Label>
                  <Input
                    id="recorder-segment"
                    value={segmentId}
                    onChange={(e) => setSegmentId(e.target.value)}
                    disabled={busy}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <Teleprompter
                segmentId={segmentId}
                narration="Leia este texto enquanto o avatar reage. O take sobe automaticamente ao parar."
                renderExtra={
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="accent"
                      disabled={busy || !cameraReady}
                      onClick={() => void recorder.start()}
                    >
                      Gravar sincronizado
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={!busy}
                      onClick={() => void recorder.stop()}
                    >
                      Parar e subir
                    </Button>
                  </div>
                }
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

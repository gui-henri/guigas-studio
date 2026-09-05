import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";
import { VideoStatus } from "../gen/app/studio/v1/video_pb";

import {
  getVideo,
  listTakes,
} from "../gen/app/studio/v1/video-VideoService_connectquery";
import LiveAvatar from "../components/LiveAvatar";
import Teleprompter from "../features/studio/Teleprompter";
import { useSegmentRecorder } from "../features/studio/useSegmentRecorder";
import { presentStatus } from "../lib/videoStatus";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import Modal from "../components/Modal";
import { cn } from "@/lib/utils";

const isRecordable = (s: VideoStatus | undefined): boolean =>
  s === VideoStatus.SCRIPT_APPROVED || s === VideoStatus.RECORDING;

function phaseButtonLabel(phase: string): string {
  switch (phase) {
    case "recording":
      return "Parar e subir";
    case "encoding":
      return "Codificando…";
    case "uploading":
      return "Subindo…";
    case "done":
      return "Gravado ✓";
    default:
      return "Gravar sincronizado";
  }
}

/** Recording studio flow (S2-08): per-segment progress backed by the server. */
export default function StudioRecordingPage() {
  const { slug = "" } = useParams();
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [confirmRedo, setConfirmRedo] = useState<string | null>(null);

  const videoQuery = useQuery(getVideo, { id: slug });
  // The video detail RPC keys by id; the slug page resolves through ListVideos
  // when needed — keep it simple by querying takes directly and finding id.
  const videoId = videoQuery.data?.video?.id ?? "";

  const takesQuery = useQuery(listTakes, { videoSlug: slug });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorder = useSegmentRecorder(slug, activeSegment ?? "", videoRef, streamRef);

  const script = videoQuery.data?.script;
  const segments = script?.segments ?? [];

  const recorded = useMemo(() => {
    const map = new Map<string, { audio: boolean; blendshapes: boolean }>();
    for (const t of takesQuery.data?.takes ?? []) {
      const entry = map.get(t.segmentId) ?? { audio: false, blendshapes: false };
      if (t.kind === "audio") entry.audio = true;
      if (t.kind === "blendshapes") entry.blendshapes = true;
      map.set(t.segmentId, entry);
    }
    return map;
  }, [takesQuery.data]);

  if (videoQuery.isLoading) {
    return <Skeleton className="h-24" aria-busy />;
  }
  if (videoQuery.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Falha ao carregar vídeo: {videoQuery.error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const status = videoQuery.data?.video?.status;
  if (!isRecordable(status)) {
    // Guard: recording window is closed (or not open yet).
    return <Navigate to={`/videos/${videoId}`} replace />;
  }

  const doneCount = [...recorded.values()].filter((v) => v.audio).length;
  if (!status) {
    return <p className="text-sm text-muted-foreground">Vídeo não encontrado.</p>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Fila
        </Link>
        <h1 className="font-display text-2xl font-semibold">{slug}</h1>
        <Badge variant="secondary">
          {presentStatus(status).label}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {doneCount}/{segments.length} segmentos gravados
        </span>
      </header>

      {status !== VideoStatus.RECORDING && (
        <Alert>
          <AlertDescription>
            O vídeo entra em <span className="font-mono">recording</span> no primeiro take
            enviado — não há botão manual por design.
          </AlertDescription>
        </Alert>
      )}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {segments.map((seg) => {
          const st = recorded.get(seg.id);
          const hasAudio = !!st?.audio;
          const missingPair = hasAudio && !st?.blendshapes;
          return (
            <li key={seg.id}>
              <Card
                className={cn(
                  "cursor-pointer transition hover:border-ring",
                  activeSegment === seg.id && "border-ring"
                )}
              >
              <button
                type="button"
                onClick={() => {
                  if (hasAudio) setConfirmRedo(seg.id);
                  else setActiveSegment(seg.id);
                }}
                className="w-full p-3 text-left text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">{seg.id}</span>
                <Badge variant={hasAudio ? "default" : "secondary"} className="ml-2">
                  {hasAudio ? "gravado" : "pendente"}
                </Badge>
                {missingPair && (
                  <Badge variant="accent" className="ml-1">
                    sem blendshapes
                  </Badge>
                )}
                <p className="mt-1 line-clamp-2 font-display text-sm text-muted-foreground">
                  {seg.narrationPt}
                </p>
              </button>
              </Card>
            </li>
          );
        })}
      </ul>

      {activeSegment && (
        <Card className="space-y-4 p-5">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-0">
            <CardTitle className="text-lg">Gravando: {activeSegment}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy()}
              onClick={() => setActiveSegment(null)}
            >
              fechar
            </Button>
          </CardHeader>

          <CardContent className="space-y-4 p-0">
          <div className="flex items-start gap-4">
            <LiveAvatar stateRef={recorder.stateRef} scale={240} />
            <video ref={videoRef} muted playsInline className="w-40 rounded border border-border" />
          </div>

          <Teleprompter
            segmentId={activeSegment}
            narration={
              segments.find((s) => s.id === activeSegment)?.narrationPt ?? ""
            }
            renderExtra={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={recorder.phase === "recording" ? "destructive" : "accent"}
                  disabled={busy() || !cameraLive()}
                  onClick={() =>
                    recorder.phase === "recording"
                      ? void recorder.stop()
                      : void recorder.start()
                  }
                >
                  {phaseButtonLabel(recorder.phase)}
                </Button>
                {recorder.phase === "uploading" && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(recorder.progress * 100)}%
                  </span>
                )}
                {recorder.error && (
                  <span className="text-xs text-destructive">{recorder.error}</span>
                )}
              </div>
            }
            onTakeReady={() => void takesQuery.refetch()}
          />
          </CardContent>
        </Card>
      )}

      {confirmRedo && (
        <Modal title={`Regravar “${confirmRedo}”?`} onClose={() => setConfirmRedo(null)}>
          <p className="text-sm text-muted-foreground">
            O take anterior será substituído (último vence). Os demais segmentos não mudam.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRedo(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              onClick={() => {
                setActiveSegment(confirmRedo);
                setConfirmRedo(null);
              }}
            >
              Regravar
            </Button>
          </div>
        </Modal>
      )}

      <footer className="border-t border-border pt-3 text-xs text-muted-foreground">
        Status geral: {presentStatus(status).label}. Próximo passo sugerido:{" "}
        {doneCount < segments.length
          ? `gravar os ${segments.length - doneCount} segmento(s) restante(s)`
          : "aguardar a junção automática (S2-09) → voice_processing"}
        . Estados mudam só por gatilhos canônicos.
      </footer>
    </div>
  );

  function busy(): boolean {
    return ["recording", "encoding", "uploading"].includes(recorder.phase);
  }

  function cameraLive(): boolean {
    return !!streamRef.current?.getVideoTracks().some((t) => t.readyState === "live");
  }
}


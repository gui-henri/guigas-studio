import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";
import { VideoStatus } from "../gen/app/studio/v1/video_pb";

import {
  getVideo,
  listTakes,
} from "../gen/app/studio/v1/video-VideoService_connectquery";
import LiveAvatar from "../components/LiveAvatar";
import Teleprompter from "../features/studio/Teleprompter";
import { useSegmentRecorder } from "../features/studio/useSegmentRecorder";
import { presentStatus } from "../lib/videoStatus";
import { deleteTake } from "../lib/uploadClient";
import { TOKEN_STORAGE_KEY } from "../lib/transport";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import Modal from "../components/Modal";
import { cn } from "@/lib/utils";

const isRecordable = (s: VideoStatus | undefined): s is VideoStatus =>
  s === VideoStatus.SCRIPT_APPROVED || s === VideoStatus.RECORDING;

export default function StudioRecordingPage() {
  const { slug = "" } = useParams();
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [confirmRedo, setConfirmRedo] = useState<string | null>(null);

  const videoQuery = useQuery(getVideo, { id: slug });
  const videoId = videoQuery.data?.video?.id ?? "";

  const takesQuery = useQuery(listTakes, { videoSlug: slug });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const recorder = useSegmentRecorder(slug, activeSegment ?? "", videoRef, streamRef);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setCameraReady(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      })
      .catch((err) => {
        console.warn("Failed to get webcam stream:", err);
        setCameraError("Webcam não detectada ou permissão negada.");
        setCameraReady(false);
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeSegment && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      void videoRef.current.play().catch(() => {});
    }
  }, [activeSegment]);

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

  const currentIndex = segments.findIndex((s) => s.id === activeSegment);
  const prevSegment = currentIndex > 0 ? segments[currentIndex - 1] : null;
  const nextSegment =
    currentIndex >= 0 && currentIndex < segments.length - 1
      ? segments[currentIndex + 1]
      : null;

  const queryClient = useQueryClient();
  const [deletingTake, setDeletingTake] = useState(false);

  const handleDiscardTake = async () => {
    if (!activeSegment) return;
    if (
      !window.confirm(
        `Deseja realmente descartar a gravação do segmento "${activeSegment}"?`
      )
    )
      return;
    setDeletingTake(true);
    try {
      await deleteTake(slug, activeSegment);
      await takesQuery.refetch();
      await queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).includes("VideoService"),
      });
      setConfirmRedo(null);
    } catch (err: unknown) {
      alert(`Falha ao descartar: ${String((err as Error).message ?? err)}`);
    } finally {
      setDeletingTake(false);
    }
  };

  const toggleRecording = useCallback(() => {
    if (recorder.phase === "recording") {
      void recorder.stop();
    } else if (
      recorder.phase === "idle" ||
      recorder.phase === "done" ||
      recorder.phase === "error"
    ) {
      void recorder.start();
    }
  }, [recorder]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === "Space" && activeSegment) {
        e.preventDefault();
        toggleRecording();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleRecording, activeSegment]);

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
    return <Navigate to={`/videos/${videoId}`} replace />;
  }

  const doneCount = [...recorded.values()].filter((v) => v.audio).length;
  const allDone = doneCount === segments.length && segments.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Fila
        </Link>
        <h1 className="font-display text-2xl font-semibold">{slug}</h1>
        <Badge variant="secondary">{presentStatus(status).label}</Badge>
        <span className="font-mono text-xs text-muted-foreground">
          {doneCount}/{segments.length} gravados
        </span>
        <Link
          to={`/videos/${videoId || slug}`}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
        >
          Ver roteiro / status
        </Link>
      </header>

      {/* Grid de Segmentos */}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {segments.map((seg) => {
          const st = recorded.get(seg.id);
          const hasAudio = !!st?.audio;
          const missingPair = hasAudio && !st?.blendshapes;
          const isSelected = activeSegment === seg.id;

          return (
            <li key={seg.id}>
              <Card
                className={cn(
                  "cursor-pointer transition hover:border-ring",
                  isSelected && "border-ring"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (hasAudio && !isSelected) setConfirmRedo(seg.id);
                    else setActiveSegment(seg.id);
                  }}
                  className="w-full p-3.5 text-left text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">
                      {seg.id}
                    </span>
                    <Badge variant={hasAudio ? "default" : "secondary"}>
                      {hasAudio ? "✓ gravado" : "pendente"}
                    </Badge>
                  </div>
                  {missingPair && (
                    <Badge variant="accent" className="mt-1">
                      sem blendshapes
                    </Badge>
                  )}
                  <p className="mt-2 line-clamp-2 font-display text-sm text-muted-foreground">
                    {seg.narrationPt}
                  </p>
                </button>
              </Card>
            </li>
          );
        })}
      </ul>

      {/* Banner de Conclusão */}
      {allDone && !activeSegment && (
        <Card className="flex items-center justify-between border-emerald-300 bg-emerald-50 p-5">
          <div>
            <h3 className="font-display text-base font-semibold text-emerald-950">
              🎉 Todos os {segments.length} segmentos foram gravados!
            </h3>
            <p className="mt-0.5 text-xs text-emerald-800">
              Os áudios sincronizados com as expressões faciais estão prontos no servidor.
            </p>
          </div>
          <Button
            asChild
            variant="accent"
            size="sm"
            className="bg-emerald-700 text-white hover:bg-emerald-800"
          >
            <Link to={`/videos/${videoId || slug}/voz`}>
              Avançar para Voz & Sublegendas →
            </Link>
          </Button>
        </Card>
      )}

      {cameraError && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900">
          <AlertDescription>⚠️ {cameraError}</AlertDescription>
        </Alert>
      )}

      {/* Painel do Gravador do Segmento Ativo */}
      {activeSegment && (
        <Card className="space-y-5 p-6">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border p-0 pb-3">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Segmento Ativo
              </span>
              <CardTitle className="font-display text-xl">{activeSegment}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={recorder.phase === "recording"}
                onClick={() => setActiveSegment(null)}
              >
                Fechar
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-0">
            {/* Avatar + Webcam + VU Meter */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {/* Live Avatar */}
              <div className="flex flex-col items-center">
                <LiveAvatar
                  stateRef={recorder.stateRef}
                  mouthRef={recorder.mouthRef}
                  scale={200}
                />
                <span className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Live Avatar (30 fps)
                </span>
              </div>

              {/* Webcam Preview + Badges */}
              <div className="flex flex-col gap-1.5">
                <div className="relative aspect-video w-56 overflow-hidden rounded-xl border border-border bg-black">
                  <video
                    ref={videoRef}
                    muted
                    playsInline
                    autoPlay
                    className="h-full w-full scale-x-[-1] object-cover"
                  />
                  <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        recorder.faceDetected
                          ? "animate-pulse bg-emerald-400"
                          : "bg-red-400"
                      )}
                    />
                    {recorder.faceDetected ? "Rosto detectado" : "Sem rosto"}
                  </div>
                  {recorder.fps > 0 && (
                    <div className="absolute right-2 bottom-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-neutral-300 backdrop-blur-sm">
                      {recorder.fps} fps · {recorder.delegate ?? "gpu"}
                    </div>
                  )}
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Câmera & MediaPipe
                </span>
              </div>

              {/* VU Meter & Microfone */}
              <Card className="flex flex-1 flex-col gap-2 bg-muted p-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    🎙️ Nível do Microfone
                  </span>
                  <span className="font-mono text-[11px]">
                    {Math.round(recorder.audioLevel * 100)}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-75"
                    style={{
                      width: `${Math.round(recorder.audioLevel * 100)}%`,
                      backgroundColor:
                        recorder.audioLevel > 0.85
                          ? "#ef4444"
                          : recorder.audioLevel > 0.6
                            ? "#22c55e"
                            : "#94a3b8",
                    }}
                  />
                </div>

                {/* Status da Gravação */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {recorder.phase === "recording" && (
                    <div className="flex items-center gap-2 font-semibold text-red-700">
                      <span className="h-2.5 w-2.5 animate-ping rounded-full bg-red-600" />
                      REC {(recorder.elapsedMs / 1000).toFixed(1)}s ·{" "}
                      {recorder.samplesCount} frames
                    </div>
                  )}
                  {recorder.phase === "uploading" && (
                    <div className="font-medium text-blue-700">
                      Enviando take para VPS (
                      {Math.round(recorder.progress * 100)}%)...
                    </div>
                  )}
                  {recorder.phase === "done" && (
                    <div className="font-medium text-emerald-700">
                      ✓ Take salvo e sincronizado no servidor!
                    </div>
                  )}
                  {recorder.error && (
                    <Alert variant="destructive">
                      <AlertDescription>⚠️ {recorder.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              </Card>
            </div>

            {/* Teleprompter */}
            <Teleprompter
              segmentId={activeSegment}
              narration={
                segments.find((s) => s.id === activeSegment)?.narrationPt ?? ""
              }
              onPrev={
                prevSegment ? () => setActiveSegment(prevSegment.id) : undefined
              }
              onNext={
                nextSegment ? () => setActiveSegment(nextSegment.id) : undefined
              }
            />

            {/* Barra de Controles Principais */}
            {(() => {
              const hasAudioRecorded = !!(
                activeSegment && recorded.get(activeSegment)?.audio
              );
              const token =
                typeof localStorage !== "undefined"
                  ? localStorage.getItem(TOKEN_STORAGE_KEY)
                  : null;
              const activeAudioUrl =
                recorder.lastSavedAudioUrl ||
                (hasAudioRecorded
                  ? `/api/v1/videos/${slug}/files/audio/${activeSegment}.wav${token ? `?token=${encodeURIComponent(token)}` : ""}`
                  : null);

              return (
                <div className="flex flex-col gap-4 border-t border-border pt-5 lg:flex-row lg:items-center lg:justify-between">
                  {/* Botão de Ação Primária (Gravar / Parar) */}
                  <div className="flex items-center">
                    <Button
                      type="button"
                      variant={
                        recorder.phase === "recording" ? "destructive" : "accent"
                      }
                      disabled={
                        !cameraReady ||
                        recorder.phase === "encoding" ||
                        recorder.phase === "uploading"
                      }
                      onClick={toggleRecording}
                    >
                      {recorder.phase === "recording" ? (
                        <>⏹️ Parar e Salvar Take (Espaço)</>
                      ) : recorder.phase === "encoding" ? (
                        <>Codificando take…</>
                      ) : recorder.phase === "uploading" ? (
                        <>Enviando ({Math.round(recorder.progress * 100)}%)…</>
                      ) : (
                        <>🔴 Gravar Segmento (Espaço)</>
                      )}
                    </Button>
                  </div>

                  {/* Replay do Take Gravado, Descartar & Próximo Segmento */}
                  <div className="flex flex-1 flex-wrap items-center justify-start gap-3 sm:gap-4 lg:justify-end">
                    {activeAudioUrl && recorder.phase !== "recording" && (
                      <Card className="flex max-w-[440px] min-w-[280px] flex-1 items-center gap-2.5 bg-muted px-3 py-1.5">
                        <span className="text-xs font-medium whitespace-nowrap text-muted-foreground">
                          🎧 Ouvir take:
                        </span>
                        <audio
                          controls
                          src={activeAudioUrl}
                          className="h-8 w-full min-w-[200px]"
                        />
                      </Card>
                    )}

                    {hasAudioRecorded && recorder.phase !== "recording" && (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={deletingTake || recorder.phase === "uploading"}
                        onClick={handleDiscardTake}
                      >
                        {deletingTake ? "Descartando…" : "🗑️ Descartar Gravação"}
                      </Button>
                    )}

                    {nextSegment && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={recorder.phase === "recording"}
                        onClick={() => setActiveSegment(nextSegment.id)}
                      >
                        Próximo ({nextSegment.id}) →
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Modal de Confirmação para Regravar */}
      {confirmRedo && (
        <Modal
          title={`Regravar “${confirmRedo}”?`}
          onClose={() => setConfirmRedo(null)}
        >
          <p className="text-sm text-muted-foreground">
            O take anterior gravado será substituído pelo novo áudio e
            blendshapes. Os demais segmentos continuam intactos.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmRedo(null)}
            >
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
              Sim, Regravar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

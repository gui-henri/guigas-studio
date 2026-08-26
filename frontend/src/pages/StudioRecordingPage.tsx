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
import { presentStatus, statusGroupClasses } from "../lib/videoStatus";
import { deleteTake } from "../lib/uploadClient";

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
    return (
      <div className="h-24 animate-pulse rounded bg-neutral-200/70" aria-busy />
    );
  }
  if (videoQuery.error) {
    return (
      <p className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Falha ao carregar vídeo: {videoQuery.error.message}
      </p>
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
        <Link to="/" className="text-sm text-ink/60 hover:text-ink">
          ← Fila
        </Link>
        <h1 className="font-serif text-2xl font-semibold">{slug}</h1>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            statusGroupClasses[presentStatus(status).group]
          }`}
        >
          {presentStatus(status).label}
        </span>
        <span className="text-xs font-mono text-ink/60">
          {doneCount}/{segments.length} gravados
        </span>
        <Link
          to={`/videos/${videoId || slug}`}
          className="ml-auto text-xs text-ink/60 hover:text-ink underline"
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
              <button
                type="button"
                onClick={() => {
                  if (hasAudio && !isSelected) setConfirmRedo(seg.id);
                  else setActiveSegment(seg.id);
                }}
                className={`w-full rounded-xl border p-3.5 text-left text-sm transition shadow-sm ${
                  isSelected
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : hasAudio
                    ? "border-emerald-200 bg-emerald-50/40 text-neutral-900 hover:border-emerald-300"
                    : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-mono text-xs ${
                      isSelected ? "text-neutral-300" : "text-neutral-500"
                    }`}
                  >
                    {seg.id}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      isSelected
                        ? "bg-neutral-800 text-neutral-200"
                        : hasAudio
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {hasAudio ? "✓ gravado" : "pendente"}
                  </span>
                </div>
                {missingPair && (
                  <span className="mt-1 inline-block rounded border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">
                    sem blendshapes
                  </span>
                )}
                <p
                  className={`mt-2 line-clamp-2 font-serif text-sm ${
                    isSelected ? "text-neutral-100" : "text-neutral-700"
                  }`}
                >
                  {seg.narrationPt}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Banner de Conclusão */}
      {allDone && !activeSegment && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 p-5 shadow-sm">
          <div>
            <h3 className="font-serif text-base font-semibold text-emerald-950">
              🎉 Todos os {segments.length} segmentos foram gravados!
            </h3>
            <p className="mt-0.5 text-xs text-emerald-800">
              Os áudios sincronizados com as expressões faciais estão prontos no servidor.
            </p>
          </div>
          <Link
            to={`/videos/${videoId || slug}/voz`}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-800"
          >
            Avançar para Voz & Sublegendas →
          </Link>
        </div>
      )}

      {cameraError && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          ⚠️ {cameraError}
        </div>
      )}

      {/* Painel do Gravador do Segmento Ativo */}
      {activeSegment && (
        <section className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div>
              <span className="font-mono text-xs uppercase tracking-wider text-neutral-400">
                Segmento Ativo
              </span>
              <h2 className="font-serif text-xl font-semibold text-neutral-900">
                {activeSegment}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={recorder.phase === "recording"}
                onClick={() => setActiveSegment(null)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-40"
              >
                Fechar
              </button>
            </div>
          </div>

          {/* Avatar + Webcam + VU Meter */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Live Avatar */}
            <div className="flex flex-col items-center">
              <LiveAvatar stateRef={recorder.stateRef} scale={200} />
              <span className="mt-1 text-[11px] font-mono text-neutral-500">
                Live Avatar (30 fps)
              </span>
            </div>

            {/* Webcam Preview + Badges */}
            <div className="flex flex-col gap-1.5">
              <div className="relative w-56 overflow-hidden rounded-xl border border-neutral-200 bg-black aspect-video">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className="h-full w-full object-cover scale-x-[-1]"
                />
                <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      recorder.faceDetected
                        ? "bg-emerald-400 animate-pulse"
                        : "bg-red-400"
                    }`}
                  />
                  {recorder.faceDetected ? "Rosto detectado" : "Sem rosto"}
                </div>
                {recorder.fps > 0 && (
                  <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-neutral-300 backdrop-blur-sm">
                    {recorder.fps} fps · {recorder.delegate ?? "gpu"}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-mono text-neutral-500">
                Câmera & MediaPipe
              </span>
            </div>

            {/* VU Meter & Microfone */}
            <div className="flex flex-1 flex-col gap-2 rounded-xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="flex items-center justify-between text-xs text-neutral-600">
                <span className="flex items-center gap-1.5 font-medium">
                  🎙️ Nível do Microfone
                </span>
                <span className="font-mono text-[11px]">
                  {Math.round(recorder.audioLevel * 100)}%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-200">
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
                  <div className="flex items-center gap-2 text-red-700 font-semibold">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-ping" />
                    REC {(recorder.elapsedMs / 1000).toFixed(1)}s ·{" "}
                    {recorder.samplesCount} frames
                  </div>
                )}
                {recorder.phase === "uploading" && (
                  <div className="text-blue-700 font-medium">
                    Enviando take para VPS (
                    {Math.round(recorder.progress * 100)}%)...
                  </div>
                )}
                {recorder.phase === "done" && (
                  <div className="text-emerald-700 font-medium">
                    ✓ Take salvo e sincronizado no servidor!
                  </div>
                )}
                {recorder.error && (
                  <div className="text-red-700 font-medium">
                    ⚠️ {recorder.error}
                  </div>
                )}
              </div>
            </div>
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
            const hasAudioRecorded = !!(activeSegment && recorded.get(activeSegment)?.audio);
            const activeAudioUrl =
              recorder.lastSavedAudioUrl ||
              (hasAudioRecorded ? `/api/v1/videos/${slug}/files/audio/${activeSegment}.wav` : null);

            return (
              <div className="flex flex-col gap-4 border-t border-neutral-100 pt-5 lg:flex-row lg:items-center lg:justify-between">
                {/* Botão de Ação Primária (Gravar / Parar) */}
                <div className="flex items-center">
                  <button
                    type="button"
                    disabled={
                      !cameraReady ||
                      recorder.phase === "encoding" ||
                      recorder.phase === "uploading"
                    }
                    onClick={toggleRecording}
                    className={`flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-sm transition ${
                      recorder.phase === "recording"
                        ? "bg-red-600 hover:bg-red-700 animate-pulse"
                        : "bg-neutral-900 hover:bg-neutral-800"
                    } disabled:opacity-40`}
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
                  </button>
                </div>

                {/* Replay do Take Gravado, Descartar & Próximo Segmento */}
                <div className="flex flex-1 flex-wrap items-center justify-start gap-3 sm:gap-4 lg:justify-end">
                  {activeAudioUrl && recorder.phase !== "recording" && (
                    <div className="flex flex-1 min-w-[280px] max-w-[440px] items-center gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 shadow-xs">
                      <span className="text-xs font-medium text-neutral-600 whitespace-nowrap">
                        🎧 Ouvir take:
                      </span>
                      <audio
                        controls
                        src={activeAudioUrl}
                        className="h-8 w-full min-w-[200px]"
                      />
                    </div>
                  )}

                  {hasAudioRecorded && recorder.phase !== "recording" && (
                    <button
                      type="button"
                      disabled={deletingTake || recorder.phase === "uploading"}
                      onClick={handleDiscardTake}
                      className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-40 transition shadow-xs whitespace-nowrap"
                    >
                      {deletingTake ? "Descartando…" : "🗑️ Descartar Gravação"}
                    </button>
                  )}

                  {nextSegment && (
                    <button
                      type="button"
                      disabled={recorder.phase === "recording"}
                      onClick={() => setActiveSegment(nextSegment.id)}
                      className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 disabled:opacity-40 whitespace-nowrap"
                    >
                      Próximo ({nextSegment.id}) →
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </section>
      )}

      {/* Modal de Confirmação para Regravar */}
      {confirmRedo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
            <h3 className="font-serif text-lg font-semibold text-neutral-900">
              Regravar segmento “{confirmRedo}”?
            </h3>
            <p className="mt-2 text-sm text-neutral-600">
              O take anterior gravado será substituído pelo novo áudio e
              blendshapes. Os demais segmentos continuam intactos.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRedo(null)}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSegment(confirmRedo);
                  setConfirmRedo(null);
                }}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
              >
                Sim, Regravar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


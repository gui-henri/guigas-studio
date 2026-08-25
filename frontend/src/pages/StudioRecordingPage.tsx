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
import { presentStatus, statusGroupClasses } from "../lib/videoStatus";

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
    return <div className="h-24 animate-pulse rounded bg-neutral-200/70" aria-busy />;
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
    // Guard: recording window is closed (or not open yet).
    return <Navigate to={`/videos/${videoId}`} replace />;
  }

  const doneCount = [...recorded.values()].filter((v) => v.audio).length;
  if (!status) {
    return <p className="text-sm text-neutral-500">Vídeo não encontrado.</p>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-ink/60 hover:text-ink">
          ← Fila
        </Link>
        <h1 className="font-serif text-2xl font-semibold">{slug}</h1>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            statusGroupClasses[presentStatus(status).group]
          }`}
        >
          {presentStatus(status).label}
        </span>
        <span className="text-xs text-ink/50">
          {doneCount}/{segments.length} segmentos gravados
        </span>
      </header>

      {status !== VideoStatus.RECORDING && (
        <p className="rounded border border-ink/15 bg-white/60 p-3 text-xs text-ink/60">
          O vídeo entra em <span className="font-mono">recording</span> no primeiro take
          enviado — não há botão manual por design.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {segments.map((seg) => {
          const st = recorded.get(seg.id);
          const hasAudio = !!st?.audio;
          const missingPair = hasAudio && !st?.blendshapes;
          return (
            <li key={seg.id}>
              <button
                type="button"
                onClick={() => {
                  if (hasAudio) setConfirmRedo(seg.id);
                  else setActiveSegment(seg.id);
                }}
                className={`w-full rounded-lg border p-3 text-left text-sm shadow-sm transition hover:border-neutral-400 ${
                  activeSegment === seg.id ? "border-accent bg-accent/5" : "border-ink/10 bg-white"
                }`}
              >
                <span className="font-mono text-xs text-ink/50">{seg.id}</span>
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                    hasAudio
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-neutral-300 bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {hasAudio ? "gravado" : "pendente"}
                </span>
                {missingPair && (
                  <span className="ml-1 rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                    sem blendshapes
                  </span>
                )}
                <p className="mt-1 line-clamp-2 font-serif text-sm text-ink/80">
                  {seg.narrationPt}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {activeSegment && (
        <section className="space-y-4 rounded-lg border border-ink/10 bg-white/70 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold">Gravando: {activeSegment}</h2>
            <button
              type="button"
              disabled={busy()}
              onClick={() => setActiveSegment(null)}
              className="text-xs text-ink/60 hover:text-ink disabled:opacity-40"
            >
              fechar
            </button>
          </div>

          <div className="flex items-start gap-4">
            <LiveAvatar stateRef={recorder.stateRef} scale={240} />
            <video ref={videoRef} muted playsInline className="w-40 rounded border border-ink/10" />
          </div>

          <Teleprompter
            segmentId={activeSegment}
            narration={
              segments.find((s) => s.id === activeSegment)?.narrationPt ?? ""
            }
            renderExtra={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy() || !cameraLive()}
                  onClick={() =>
                    recorder.phase === "recording"
                      ? void recorder.stop()
                      : void recorder.start()
                  }
                  className={`rounded px-4 py-2 text-sm ${
                    recorder.phase === "recording"
                      ? "bg-red-700 text-white hover:bg-red-800"
                      : "bg-accent text-paper hover:opacity-90"
                  } disabled:opacity-40`}
                >
                  {phaseButtonLabel(recorder.phase)}
                </button>
                {recorder.phase === "uploading" && (
                  <span className="text-xs text-ink/60">
                    {Math.round(recorder.progress * 100)}%
                  </span>
                )}
                {recorder.error && (
                  <span className="text-xs text-red-700">{recorder.error}</span>
                )}
              </div>
            }
            onTakeReady={() => void takesQuery.refetch()}
          />
        </section>
      )}

      {confirmRedo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-6">
            <h3 className="font-serif text-lg font-semibold">Regravar “{confirmRedo}”?</h3>
            <p className="mt-2 text-sm text-ink/70">
              O take anterior será substituído (último vence). Os demais segmentos não mudam.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRedo(null)}
                className="rounded border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSegment(confirmRedo);
                  setConfirmRedo(null);
                }}
                className="rounded bg-accent px-3 py-1.5 text-xs text-paper hover:opacity-90"
              >
                Regravar
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-ink/10 pt-3 text-xs text-ink/50">
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


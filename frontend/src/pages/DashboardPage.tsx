import { useState } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { useNavigate } from "react-router-dom";

import {
  listVideos,
  triggerRssPoll,
} from "../gen/app/studio/v1/video-VideoService_connectquery";
import { VideoStatus } from "../gen/app/studio/v1/video_pb";
import type { Video } from "../gen/app/studio/v1/video_pb";
import { useRpcMutation } from "../lib/rpc";
import {
  presentStatus,
  statusGroupClasses,
  relativeTime,
} from "../lib/videoStatus";

function StatusBadge({ status }: { status: VideoStatus }) {
  const { label, group } = presentStatus(status);
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs ${statusGroupClasses[group]}`}
    >
      {label}
    </span>
  );
}

function VideoCard({ video }: { video: Video }) {
  const navigate = useNavigate();
  const onClick = () => void navigate(`/videos/${video.id}`);

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-neutral-400 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-medium leading-snug">{video.title}</h2>
        <StatusBadge status={video.status} />
      </div>
      <p className="mt-1 truncate font-mono text-xs text-neutral-500">{video.slug}</p>
      <p className="mt-3 text-xs text-neutral-500">{relativeTime(video.createdAt)}</p>
    </button>
  );
}

export default function DashboardPage() {
  const [feedback, setFeedback] = useState<{
    type: "success" | "info" | "error";
    text: string;
  } | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = useQuery(listVideos);

  const { mutate: syncRss, isPending: isSyncing } = useRpcMutation(triggerRssPoll, {
    invalidate: [listVideos],
    onSuccess: (res) => {
      if (res.newPostsCount > 0) {
        setFeedback({
          type: "success",
          text: `🎉 ${res.newPostsCount} novo(s) post(s) importado(s) com sucesso!`,
        });
      } else {
        setFeedback({
          type: "info",
          text: "O feed RSS foi verificado e já está atualizado (nenhum post novo).",
        });
      }
    },
    onError: (err) => {
      setFeedback({
        type: "error",
        text: `Falha ao buscar feed RSS: ${err.message}`,
      });
    },
  });

  const videos = data?.videos ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Pipeline de Vídeos</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {videos.length} vídeo(s) no pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setFeedback(null);
              syncRss({});
            }}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <svg
              className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
              />
            </svg>
            {isSyncing ? "Buscando feed RSS…" : "Sincronizar RSS"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between rounded-lg p-3 text-xs ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : feedback.type === "error"
              ? "bg-red-50 text-red-800 border border-red-200"
              : "bg-blue-50 text-blue-800 border border-blue-200"
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="ml-2 font-bold hover:opacity-75"
          >
            ✕
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-28 animate-pulse rounded-lg bg-neutral-200/70" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">Falha ao carregar vídeos: {error.message}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="mt-2 rounded border border-red-300 px-3 py-1 text-xs hover:bg-red-100 disabled:opacity-50"
          >
            {isRefetching ? "Tentando…" : "Tentar de novo"}
          </button>
        </div>
      ) : videos.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 p-12 text-center">
          <p className="text-sm text-neutral-600">Nenhum vídeo no pipeline no momento.</p>
          <p className="mt-1 text-xs text-neutral-400">
            Clique em "Sincronizar RSS" acima ou aguarde o watcher automático detectar novos posts.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}

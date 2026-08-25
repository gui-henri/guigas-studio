import { useQuery } from "@connectrpc/connect-query";
import { useNavigate } from "react-router-dom";

import { listVideos } from "../gen/app/studio/v1/video-VideoService_connectquery";
import { VideoStatus } from "../gen/app/studio/v1/video_pb";
import type { Video } from "../gen/app/studio/v1/video_pb";
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
  const { data, isLoading, error, refetch, isRefetching } = useQuery(listVideos);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-28 animate-pulse rounded-lg bg-neutral-200/70" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  const videos = data?.videos ?? [];
  if (videos.length === 0) {
    return (
      <p className="mt-16 text-center text-sm text-neutral-500">
        Nenhum vídeo ainda. Quando um post sair no blog, o watcher cria o card
        automaticamente.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}

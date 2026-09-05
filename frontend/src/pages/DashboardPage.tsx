import { useState } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import {
  listVideos,
  triggerRssPoll,
} from "../gen/app/studio/v1/video-VideoService_connectquery";
import { VideoStatus } from "../gen/app/studio/v1/video_pb";
import type { Video } from "../gen/app/studio/v1/video_pb";
import { useRpcMutation } from "../lib/rpc";
import {
  presentStatus,
  relativeTime,
} from "../lib/videoStatus";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";

function StatusBadge({ status }: { status: VideoStatus }) {
  const { label } = presentStatus(status);
  return <Badge variant="secondary">{label}</Badge>;
}

function VideoCard({ video }: { video: Video }) {
  const navigate = useNavigate();
  const onClick = () => void navigate(`/videos/${video.id}`);

  return (
    <Card
      className="cursor-pointer text-left transition hover:border-ring hover:shadow"
    >
      <div onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick()} role="button" tabIndex={0}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <CardTitle className="text-base font-medium leading-snug">{video.title}</CardTitle>
        <StatusBadge status={video.status} />
      </CardHeader>
      <CardContent>
        <p className="truncate font-mono text-xs text-muted-foreground">{video.slug}</p>
        <p className="mt-3 text-xs text-muted-foreground">{relativeTime(video.createdAt)}</p>
      </CardContent>
      </div>
    </Card>
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
          text: `${res.newPostsCount} novo(s) post(s) importado(s) com sucesso!`,
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold">Pipeline de Vídeos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {videos.length} vídeo(s) no pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              setFeedback(null);
              syncRss({});
            }}
            disabled={isSyncing}
          >
            <RefreshCw className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? "Buscando feed RSS…" : "Sincronizar RSS"}
          </Button>
        </div>
      </div>

      {feedback && (
        <Alert variant={feedback.type === "error" ? "destructive" : "default"}>
          <AlertDescription>
            <span>{feedback.text}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFeedback(null)}
              className="ml-2"
            >
              ✕
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-28" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            Falha ao carregar vídeos: {error.message}
          </AlertDescription>
          <div className="mt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isRefetching}
            >
              {isRefetching ? "Tentando…" : "Tentar de novo"}
            </Button>
          </div>
        </Alert>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum vídeo no pipeline no momento.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clique em "Sincronizar RSS" acima ou aguarde o watcher automático detectar novos posts.
            </p>
          </CardContent>
        </Card>
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

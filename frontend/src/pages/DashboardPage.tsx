import { useQuery } from "@connectrpc/connect-query";
import { useNavigate } from "react-router-dom";

import { listVideos } from "../gen/app/studio/v1/video-VideoService_connectquery";
import { VideoStatus } from "../gen/app/studio/v1/video_pb";
import type { Video } from "../gen/app/studio/v1/video_pb";
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
  const { data, isLoading, error, refetch, isRefetching } = useQuery(listVideos);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-28" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  const videos = data?.videos ?? [];
  if (videos.length === 0) {
    return (
      <p className="mt-16 text-center text-sm text-muted-foreground">
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

import { useMemo, useState } from "react";
import { useQuery } from "@connectrpc/connect-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Film, RefreshCw } from "lucide-react";

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
  statusGroupClasses,
  type StatusGroup,
} from "../lib/videoStatus";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: VideoStatus }) {
  const { label, group } = presentStatus(status);
  const colorClass = statusGroupClasses[group] ?? "bg-muted text-muted-foreground border-border";

  return (
    <Badge
      variant="outline"
      className={cn("text-[11px] font-medium border px-2 py-0.5 whitespace-nowrap", colorClass)}
    >
      {label}
    </Badge>
  );
}

function getNextActionLabel(status: VideoStatus): string {
  switch (status) {
    case VideoStatus.SCRIPT_PENDING:
    case VideoStatus.SCRIPT_REVIEW:
      return "Revisar Roteiro";
    case VideoStatus.SCRIPT_APPROVED:
    case VideoStatus.RECORDING:
      return "Gravar no Estúdio";
    case VideoStatus.VOICE_PROCESSING:
      return "Ver Voz & Visemes";
    case VideoStatus.SCENES_PENDING:
    case VideoStatus.SCENES_REVIEW:
      return "Revisar Cenas";
    case VideoStatus.QUEUED:
    case VideoStatus.RENDERING:
    case VideoStatus.FINAL_REVIEW:
      return "Validar Corte Final";
    case VideoStatus.RELEASED:
      return "Ver Releases";
    default:
      return "Abrir Vídeo";
  }
}

function getStageUrl(video: Video): string {
  switch (video.status) {
    case VideoStatus.SCRIPT_APPROVED:
    case VideoStatus.RECORDING:
      return `/videos/${video.slug}/studio`;
    case VideoStatus.VOICE_PROCESSING:
      return `/videos/${video.id}/voz`;
    case VideoStatus.SCENES_PENDING:
    case VideoStatus.SCENES_REVIEW:
      return `/videos/${video.id}/scenes`;
    case VideoStatus.QUEUED:
    case VideoStatus.RENDERING:
    case VideoStatus.FINAL_REVIEW:
    case VideoStatus.RELEASED:
      return `/videos/${video.id}/final`;
    default:
      return `/videos/${video.id}`;
  }
}

function VideoCard({ video }: { video: Video }) {
  const navigate = useNavigate();
  const onClick = () => void navigate(getStageUrl(video));
  const actionLabel = getNextActionLabel(video.status);

  return (
    <Card
      className="group cursor-pointer text-left transition-all hover:border-accent hover:shadow-md bg-card"
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      role="button"
      tabIndex={0}
    >
      <div className="flex h-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="font-display text-base font-semibold leading-snug text-foreground group-hover:text-accent transition-colors line-clamp-2">
            {video.title}
          </CardTitle>
          <StatusBadge status={video.status} />
        </div>

        <p className="mt-2 truncate font-mono text-xs text-muted-foreground/80">
          {video.slug}
        </p>

        <div className="mt-auto pt-5 flex items-center justify-between border-t border-border/60 text-xs text-muted-foreground">
          <span>{relativeTime(video.createdAt)}</span>
          <span className="inline-flex items-center gap-1 font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity">
            <span>{actionLabel}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Card>
  );
}

type FilterGroup = "todos" | StatusGroup;

const FILTER_TABS: Array<{ id: FilterGroup; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "roteiro", label: "Roteiro" },
  { id: "gravação", label: "Gravação" },
  { id: "voz/cenas", label: "Voz & Cenas" },
  { id: "montagem", label: "Montagem" },
  { id: "lançado", label: "Lançados" },
];

export default function DashboardPage() {
  const [activeFilter, setActiveFilter] = useState<FilterGroup>("todos");
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

  const filterCounts = useMemo(() => {
    const counts: Record<FilterGroup, number> = {
      todos: videos.length,
      novo: 0,
      roteiro: 0,
      "gravação": 0,
      "voz/cenas": 0,
      montagem: 0,
      lançado: 0,
      bloqueado: 0,
    };
    for (const v of videos) {
      const g = presentStatus(v.status).group;
      counts[g] = (counts[g] || 0) + 1;
    }
    return counts;
  }, [videos]);

  const filteredVideos = useMemo(() => {
    if (activeFilter === "todos") return videos;
    return videos.filter((v) => presentStatus(v.status).group === activeFilter);
  }, [videos, activeFilter]);

  return (
    <div className="space-y-6">
      {/* Header com Título e Sincronização */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Pipeline de Produção
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Gerencie o ciclo de vida dos vídeos: da captura do blog ao lançamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setFeedback(null);
              syncRss({});
            }}
            disabled={isSyncing}
            className="gap-2 shadow-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
            <span>{isSyncing ? "Buscando RSS…" : "Sincronizar RSS"}</span>
          </Button>
        </div>
      </div>

      {/* Feedback de Sincronização */}
      {feedback && (
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border p-3.5 text-sm shadow-xs transition-all",
            feedback.type === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-accent/30 bg-accent/5 text-foreground"
          )}
        >
          <span className="font-medium text-xs sm:text-sm">{feedback.text}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFeedback(null)}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          >
            ✕
          </Button>
        </div>
      )}

      {/* Filtros por Etapa */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" aria-label="Filtros por etapa">
        {FILTER_TABS.map((tab) => {
          const count = filterCounts[tab.id] ?? 0;
          const isActive = activeFilter === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                isActive
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-card border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px] font-mono",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Conteúdo Principal */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            Falha ao carregar vídeos: {error.message}
          </AlertDescription>
          <div className="mt-3">
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
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Film className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-foreground">Nenhum vídeo no pipeline no momento.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Clique em "Sincronizar RSS" acima ou aguarde o watcher automático detectar novos posts do blog.
            </p>
          </CardContent>
        </Card>
      ) : filteredVideos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum vídeo encontrado na etapa "{FILTER_TABS.find((t) => t.id === activeFilter)?.label}".
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveFilter("todos")}
              className="mt-3 text-xs"
            >
              Ver todos os vídeos
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredVideos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}

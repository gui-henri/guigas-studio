import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";

import { getVideo, listTakes } from "../gen/app/studio/v1/video-VideoService_connectquery";
import { AvatarPreviewPlayer } from "@guigas/remotion-kit";
import type { SpriteMeta, TimelineView } from "@guigas/remotion-kit";
import { useSegmentAssets } from "../hooks/useSegmentAssets";
import spriteMetaJson from "@guigas/remotion-kit/assets/sprite.json";
import sheetUrl from "@guigas/remotion-kit/assets/sprite-placeholder.png";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import VideoPipelineNav from "../components/VideoPipelineNav";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

const SPRITE_META = spriteMetaJson as SpriteMeta;
const SHEET_URL = sheetUrl;

/** Voice tab (S3-08): per-segment preview with real audio + animated avatar. */
export default function VoicePreviewPage() {
  const { id = "" } = useParams();
  const [selected, setSelected] = useState<string | null>(null);

  const videoQuery = useQuery(getVideo, { id });
  const slug = videoQuery.data?.video?.slug ?? "";
  const takesQuery = useQuery(listTakes, { videoSlug: slug }, { enabled: slug !== "" });

  const segments = videoQuery.data?.script?.segments ?? [];
  const recordedSegments = useMemo(() => {
    const set = new Set<string>();
    for (const t of takesQuery.data?.takes ?? []) {
      if (t.kind === "audio") set.add(t.segmentId);
    }
    return set;
  }, [takesQuery.data]);

  const activeId = selected ?? segments.find((s) => recordedSegments.has(s.id))?.id ?? null;
  const assets = useSegmentAssets(id, activeId ?? "");
  const timeline = useMemo<TimelineView | null>(() => {
    if (!assets.timelineJson) return null;
    try {
      return JSON.parse(assets.timelineJson);
    } catch {
      return null;
    }
  }, [assets.timelineJson]);

  if (videoQuery.isLoading) {
    return <Skeleton className="h-24" aria-busy />;
  }

  return (
    <div className="space-y-6">
      <VideoPipelineNav
        videoId={id}
        videoSlug={slug}
        status={videoQuery.data?.video?.status}
        currentStage="voz"
        actions={
          <Link to={`/videos/${id}/scenes`}>
            <Button variant="outline" size="sm" className="gap-1.5 shadow-xs">
              <span>Avançar para Cenas</span>
              <span>→</span>
            </Button>
          </Link>
        }
      />

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {segments.map((seg) => {
          const has = recordedSegments.has(seg.id);
          return (
            <li key={seg.id}>
              <Button
                type="button"
                variant={activeId === seg.id ? "accent" : "outline"}
                disabled={!has}
                onClick={() => setSelected(seg.id)}
                className={cn("h-auto w-full justify-start p-3", !has && "border-dashed opacity-60")}
              >
                <span className="font-mono text-xs">{seg.id}</span>
                <Badge variant={has ? "default" : "secondary"} className="ml-2">
                  {has ? "✓ pronto" : "processando…"}
                </Badge>
              </Button>
            </li>
          );
        })}
      </ul>

      {!activeId && (
        <Card className="border-dashed p-8 text-center bg-card">
          <Mic className="mx-auto h-8 w-8 text-muted-foreground/60 mb-3" />
          <h3 className="font-display text-base font-semibold text-foreground">
            Aguardando gravações de áudio
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
            Nenhum segmento com take + timeline ainda. Esta lista atualiza sozinha conforme o
            pipeline de voz termina cada um.
          </p>
          <div className="mt-4">
            <Link to={`/videos/${slug || id}/studio`}>
              <Button variant="accent" size="sm" className="gap-1.5 shadow-xs">
                <span>Abrir Estúdio para Gravar</span>
                <span>🎙️</span>
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {activeId && assets.loading && (
        <Skeleton className="h-64 rounded-xl" aria-busy />
      )}
      {activeId && !assets.loading && (!timeline || !assets.wavUrl) && (
        <Alert>
          <AlertDescription>
            Take ou timeline ainda indisponível para este segmento.
          </AlertDescription>
        </Alert>
      )}
      {activeId && timeline && assets.wavUrl && (
        <Card className="p-4 sm:p-6 bg-card border-border flex flex-col items-center justify-center shadow-xs">
          <div className="w-full max-w-[640px]">
            <AvatarPreviewPlayer
              timeline={timeline}
              wavUrl={assets.wavUrl}
              spriteSheetUrl={SHEET_URL}
              spriteMeta={SPRITE_META}
              maxWidth={640}
            />
          </div>
        </Card>
      )}
    </div>
  );
}


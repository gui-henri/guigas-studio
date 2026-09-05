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
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "@/lib/utils";

const SPRITE_META = spriteMetaJson as SpriteMeta;
const SHEET_URL = new URL(sheetUrl, import.meta.url).href;

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
  const timeline = useMemo<TimelineView | null>(
    () => (assets.timelineJson ? JSON.parse(assets.timelineJson) : null),
    [assets.timelineJson]
  );

  if (videoQuery.isLoading) {
    return <Skeleton className="h-24" aria-busy />;
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Fila
        </Link>
        <h1 className="font-display text-2xl font-semibold">Voz · {slug}</h1>
      </header>

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
        <Alert>
          <AlertDescription>
            Nenhum segmento com take + timeline ainda. Esta lista atualiza sozinha conforme o
            pipeline de voz termina cada um.
          </AlertDescription>
        </Alert>
      )}

      {activeId && assets.loading && (
        <Skeleton className="h-64" aria-busy />
      )}
      {activeId && !assets.loading && (!timeline || !assets.wavUrl) && (
        <Alert>
          <AlertDescription>
            Take ou timeline ainda indisponível para este segmento.
          </AlertDescription>
        </Alert>
      )}
      {activeId && timeline && assets.wavUrl && (
        <AvatarPreviewPlayer
          timeline={timeline}
          wavUrl={assets.wavUrl}
          spriteSheetUrl={SHEET_URL}
          spriteMeta={SPRITE_META}
          maxWidth={640}
        />
      )}
    </div>
  );
}


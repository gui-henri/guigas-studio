import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";

import { getVideo, listTakes } from "../gen/app/studio/v1/video-VideoService_connectquery";
import { AvatarPreviewPlayer } from "@guigas/remotion-kit";
import type { SpriteMeta, TimelineView } from "@guigas/remotion-kit";
import { useSegmentAssets } from "../hooks/useSegmentAssets";
import spriteMetaJson from "@guigas/remotion-kit/assets/sprite.json";
import sheetUrl from "@guigas/remotion-kit/assets/sprite-placeholder.png";

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
    return <div className="h-24 animate-pulse rounded bg-neutral-200/70" aria-busy />;
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <Link to="/" className="text-sm text-ink/60 hover:text-ink">
          ← Fila
        </Link>
        <h1 className="font-serif text-2xl font-semibold">Voz · {slug}</h1>
      </header>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {segments.map((seg) => {
          const has = recordedSegments.has(seg.id);
          return (
            <li key={seg.id}>
              <button
                type="button"
                disabled={!has}
                onClick={() => setSelected(seg.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                  activeId === seg.id
                    ? "border-accent bg-accent/5"
                    : has
                      ? "border-ink/10 bg-white hover:border-neutral-400"
                      : "cursor-not-allowed border-dashed border-ink/15 bg-transparent opacity-60"
                }`}
              >
                <span className="font-mono text-xs">{seg.id}</span>
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                    has
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border border-neutral-300 bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {has ? "✓ pronto" : "processando…"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!activeId && (
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Nenhum segmento com take + timeline ainda. Esta lista atualiza sozinha conforme o
          pipeline de voz termina cada um.
        </p>
      )}

      {activeId && assets.loading && (
        <div className="h-64 animate-pulse rounded bg-neutral-200/70" aria-busy />
      )}
      {activeId && !assets.loading && (!timeline || !assets.wavUrl) && (
        <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Take ou timeline ainda indisponível para este segmento.
        </p>
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


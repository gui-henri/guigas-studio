import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import { VideoStatus } from "../gen/app/studio/v1/video_pb";
import { presentStatus } from "../lib/videoStatus";

import {
  approveScenes,
  getVideo,
  listTakes,
} from "../gen/app/studio/v1/video-VideoService_connectquery";
import { useMutation } from "@connectrpc/connect-query";
import {
  SegmentPreviewPlayer,
  type SpriteMeta,
} from "@guigas/remotion-kit";
import { useSegmentAssets } from "../hooks/useSegmentAssets";
import { useInView } from "../hooks/useInView";
import spriteMetaJson from "@guigas/remotion-kit/assets/sprite.json";
import sheetUrl from "@guigas/remotion-kit/assets/sprite-placeholder.png";
import {
  CATALOG_URL,
  buildFixPrompt,
  draftKey,
  loadDecisions,
  reviewProgress,
  saveDecisions,
  type SceneCardDecision,
} from "../lib/scenesReview";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { Textarea } from "../components/ui/textarea";
import VideoPipelineNav from "../components/VideoPipelineNav";
import { cn } from "@/lib/utils";

const SPRITE_META = spriteMetaJson as SpriteMeta;
const SHEET_URL = new URL(sheetUrl, import.meta.url).href;

interface CardProps {
  videoId: string;
  segmentId: string;
  scene: unknown;
  sceneType: string | null;
  narration: string;
  hasAudio?: boolean;
  decision?: SceneCardDecision;
  reviewing?: boolean;
  onDecide: (segmentId: string, decision: SceneCardDecision | undefined) => void;
}

function SegmentCard(props: CardProps) {
  const {
    videoId,
    segmentId,
    scene,
    sceneType,
    narration,
    hasAudio,
    decision,
    onDecide,
  } = props;
  const reviewing = props.reviewing;
  const { ref, inView } = useInView<HTMLDivElement>();
  const assets = useSegmentAssets(videoId, segmentId);
  const timeline = useMemo(() => {
    if (!assets.timelineJson) return null;
    try {
      return JSON.parse(assets.timelineJson);
    } catch {
      return null;
    }
  }, [assets.timelineJson]);
  const [comment, setComment] = useState(decision?.comment ?? "");
  const [rejecting, setRejecting] = useState(false);
  const [copied, setCopied] = useState(false);

  const isApproved = decision?.decision === "approved";
  const isRejected = decision?.decision === "rejected";

  function approve() {
    onDecide(segmentId, {
      decision: "approved",
      decidedAt: new Date().toISOString(),
    });
  }

  function reject() {
    if (comment.trim().length === 0) return; // blocked without comment
    onDecide(segmentId, {
      decision: "rejected",
      comment: comment.trim(),
      decidedAt: new Date().toISOString(),
    });
  }

  async function copyPrompt() {
    const prompt = buildFixPrompt({
      slug: "",
      segmentId,
      sceneType,
      comment: decision?.comment ?? comment ?? "",
    });
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Card
      ref={ref}
      data-testid="scene-card"
      data-segment={segmentId}
      className={cn(isRejected && "border-destructive/60")}
    >
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <span className="font-mono text-xs text-muted-foreground">{segmentId}</span>
        {hasAudio === false ? (
          <Badge variant="secondary">
            sem áudio
          </Badge>
        ) : null}
        {sceneType ? (
          <a href={CATALOG_URL} target="_blank" rel="noreferrer" title="Ver catálogo de cenas">
            <Badge variant="accent">{sceneType}</Badge>
          </a>
        ) : (
          <Badge variant="secondary">
            só avatar
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {isApproved ? "✓ aprovado" : isRejected ? "✗ reprovado" : ""}
        </span>
      </CardHeader>

      <CardContent>
      <p className="mb-3 line-clamp-2 font-display text-sm italic text-muted-foreground">
        {narration}
      </p>

      <div data-testid="player-slot" className="min-h-40">
        {inView && timeline ? (
          <SegmentPreviewPlayer
            avatarTimeline={timeline}
            wavUrl={assets.wavUrl}
            spriteSheetUrl={SHEET_URL}
            spriteMeta={SPRITE_META}
            maxWidth={480}
            scene={scene}
          />
        ) : (
          <div
            className="flex h-44 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground"
            aria-busy={assets.loading}
          >
            {assets.loading
              ? "carregando artefatos…"
              : !inView
                ? "role para pré-visualizar"
                : "timeline indisponível para este segmento"}
          </div>
        )}
      </div>

      {reviewing && !isApproved ? (
        rejecting || isRejected ? (
          <div className="mt-3 space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário obrigatório — o que corrigir?"
              rows={2}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={reject}
                disabled={comment.trim().length === 0}
              >
                Confirmar reprovação
              </Button>
              {!isRejected ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRejecting(false)}
                >
                  cancelar
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyPrompt}
                data-testid="copy-prompt"
                className="ml-auto"
              >
                {copied ? "copiado!" : "copiar prompt"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="accent" size="sm" onClick={approve}>
              Aprovar
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setRejecting(true)}>
              Reprovar
            </Button>
          </div>
        )
      ) : null}
      </CardContent>
    </Card>
  );
}

/** Scenes review page (S4-08): cards + decisions + prepareRender gate. */
export default function ScenesReviewPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();

  const videoQuery = useQuery(getVideo, { id });
  const slug = videoQuery.data?.video?.slug ?? "";
  const updatedAt = videoQuery.data?.video?.updatedAt ?? "";
  const status = videoQuery.data?.video?.status;
  const segments = useMemo(
    () => videoQuery.data?.script?.segments ?? [],
    [videoQuery.data]
  );
  const takesQuery = useQuery(listTakes, { videoSlug: slug }, { enabled: slug !== "" });

  const recordedSegments = useMemo(() => {
    const set = new Set<string>();
    for (const t of takesQuery.data?.takes ?? []) {
      if (t.kind === "audio") set.add(t.segmentId);
    }
    return set;
  }, [takesQuery.data]);

  const key = draftKey(slug, updatedAt || String(segments.length));
  const [decisions, setDecisions] = useState<Record<string, SceneCardDecision>>({});

  // Reload draft when the storage key changes (slug/version).
  useEffect(() => {
    if (!slug) return;
    setDecisions(loadDecisions(key));
  }, [key, slug]);

  function updateDecision(segmentId: string, decision: SceneCardDecision | undefined) {
    setDecisions((prev) => {
      const next = { ...prev };
      if (decision) next[segmentId] = decision;
      else delete next[segmentId];
      saveDecisions(key, next);
      return next;
    });
  }

  const cards = useMemo(
    () =>
      segments.map((s) => ({
        segmentId: s.id,
        sceneType: s.scene?.type ?? null,
        decision: decisions[s.id]?.decision,
      })),
    [segments, decisions]
  );
  const progress = reviewProgress(cards);
  const reviewing = status === VideoStatus.SCENES_REVIEW;

  const approveScenesMutation = useMutation(approveScenes, {
    onSuccess: () => {
      setPrepared(true);
      void queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).includes("VideoService"),
      });
    },
    onError: (err) => {
      setPrepareError(err.message ?? "falha ao preparar render");
    },
  });

  const [prepared, setPrepared] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);

  function prepareRender() {
    // Re-validates preconditions at click time; server re-checks the state
    // and enqueues exactly one render job inside a transaction (S5-01).
    if (!progress.isComplete || !reviewing || prepared) return;
    setPrepareError(null);
    approveScenesMutation.mutate({ videoId: id });
  }

  if (videoQuery.isLoading) {
    return <Skeleton className="h-24" aria-busy />;
  }

  return (
    <div className="space-y-6" data-testid="scenes-review-page">
      <VideoPipelineNav
        videoId={id}
        videoSlug={slug}
        status={status}
        currentStage="cenas"
        extraMeta={
          <Badge
            variant="accent"
            data-testid="review-progress"
          >
            {progress.approved}/{progress.total} aprovadas
          </Badge>
        }
        actions={
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={prepareRender}
            disabled={!progress.isComplete || !reviewing || prepared}
            data-testid="approve-all"
            title={
              !reviewing
                ? "Fora do estado scenes_review (somente leitura)"
                : progress.isComplete
                  ? "Prepara o render (enqueue na S5-01)"
                  : "Aprove todas as cenas primeiro"
            }
          >
            {approveScenesMutation.isPending
              ? "preparando…"
              : prepared
                ? "render preparado ✓"
                : "Aprovar tudo & renderizar"}
          </Button>
        }
      />

      {prepareError ? (
        <Alert variant="destructive">
          <AlertDescription>{prepareError}</AlertDescription>
        </Alert>
      ) : null}

      {!reviewing ? (
        <Alert>
          <AlertDescription>
            Status atual:{" "}
            <strong>
              {status !== undefined ? presentStatus(status).label : "—"}
            </strong>{" "}
            — ações de revisão de cenas só ficam disponíveis no estágio de revisão de cenas.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {segments.map((s) => (
          <SegmentCard
            key={s.id}
            videoId={id}
            segmentId={s.id}
            scene={s.scene ?? null}
            sceneType={s.scene?.type ?? null}
            narration={s.narrationPt}
            hasAudio={recordedSegments.has(s.id)}
            decision={decisions[s.id]}
            reviewing={reviewing}
            onDecide={updateDecision}
          />
        ))}
      </div>
    </div>
  );
}

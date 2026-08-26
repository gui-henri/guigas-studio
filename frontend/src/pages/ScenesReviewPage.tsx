import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import { VideoStatus } from "../gen/app/studio/v1/video_pb";

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
  const timeline = useMemo(
    () => (assets.timelineJson ? JSON.parse(assets.timelineJson) : null),
    [assets.timelineJson]
  );
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
    <article
      ref={ref}
      data-testid="scene-card"
      data-segment={segmentId}
      className={`rounded-xl border bg-surface p-4 shadow-sm ${
        isRejected ? "border-removed/60" : "border-line"
      }`}
    >
      <header className="mb-3 flex items-center gap-2">
        <span className="font-mono text-xs text-ink/60">{segmentId}</span>
        {hasAudio === false ? (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-ink/70">
            sem áudio
          </span>
        ) : null}
        {sceneType ? (
          <a
            href={CATALOG_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent hover:bg-accent/20"
            title="Ver catálogo de cenas"
          >
            {sceneType}
          </a>
        ) : (
          <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-ink/70">
            só avatar
          </span>
        )}
        <span className="ml-auto text-xs text-ink/60">
          {isApproved ? "✓ aprovado" : isRejected ? "✗ reprovado" : ""}
        </span>
      </header>

      <p className="mb-3 line-clamp-2 font-serif text-sm italic text-ink/80">
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
            className="flex h-44 items-center justify-center rounded-lg border border-dashed border-line text-xs text-ink/50"
            aria-busy={assets.loading}
          >
            {assets.loading ? "carregando artefatos…" : "role para pré-visualizar"}
          </div>
        )}
      </div>

      {reviewing && !isApproved ? (
        rejecting || isRejected ? (
          <div className="mt-3 space-y-2">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário obrigatório — o que corrigir?"
              rows={2}
              className="w-full rounded-md border border-line bg-paper p-2 text-sm focus:border-accent focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={reject}
                disabled={comment.trim().length === 0}
                className="rounded-md bg-removed px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Confirmar reprovação
              </button>
              {!isRejected ? (
                <button
                  type="button"
                  onClick={() => setRejecting(false)}
                  className="text-sm text-ink/60 hover:text-ink"
                >
                  cancelar
                </button>
              ) : null}
              <button
                type="button"
                onClick={copyPrompt}
                data-testid="copy-prompt"
                className="ml-auto rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent"
              >
                {copied ? "copiado!" : "copiar prompt"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={approve}
              className="rounded-md bg-added px-3 py-1.5 text-sm font-medium text-white"
            >
              Aprovar
            </button>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-removed hover:text-removed"
            >
              Reprovar
            </button>
          </div>
        )
      ) : null}
    </article>
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
    return <div className="h-24 animate-pulse rounded bg-neutral-200/70" aria-busy />;
  }

  return (
    <div className="space-y-5" data-testid="scenes-review-page">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-ink/60 hover:text-ink">
          ← Fila
        </Link>
        <h1 className="font-serif text-2xl font-semibold">Cenas · {slug}</h1>
        <div
          data-testid="review-progress"
          className="ml-auto rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent"
        >
          {progress.approved}/{progress.total} aprovadas
        </div>
        <button
          type="button"
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
          className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper disabled:opacity-40"
        >
          {approveScenesMutation.isPending
            ? "preparando…"
            : prepared
              ? "render preparado ✓"
              : "Aprovar tudo"}
        </button>
      </header>

      {prepareError ? (
        <p className="rounded-lg border border-removed/50 bg-surface px-4 py-2 text-sm text-removed">
          {prepareError}
        </p>
      ) : null}

      {!reviewing ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink/70">
          Status atual: <strong>{status}</strong> — ações de review desabilitadas.
        </p>
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

import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

import {
  approveFinalCut,
  getReleaseChecklist,
  getVideo,
  requestRerender,
  setChecklistItemPublished,
} from "../gen/app/studio/v1/video-VideoService_connectquery";
import { TOKEN_STORAGE_KEY } from "../lib/transport";
import { VideoStatus } from "../gen/app/studio/v1/video_pb";
import { presentStatus } from "../lib/videoStatus";
import {
  durationDeviation,
  formatDuration,
  formatMB,
} from "../lib/finalReview";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { Textarea } from "../components/ui/textarea";
import Modal from "../components/Modal";
import VideoPipelineNav from "../components/VideoPipelineNav";

interface RenderInfo {
  path: string;
  bytes: number;
  durationS: number;
}

function mediaUrl(videoId: string, renderPath: string): string {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  // Pragmatic T-04 extension (S5-07 note): <video> cannot send headers, so the
  // media GET accepts a short-lived token via query param.
  return `/api/v1/videos/${videoId}/files/${renderPath}?access_token=${encodeURIComponent(token)}`;
}

/**
 * Final review page (S5-10): long + shorts side by side with metadata,
 * target deviation badge and Approve / Re-render actions.
 */
export default function FinalReviewPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();

  const videoQuery = useQuery(getVideo, { id });
  const video = videoQuery.data?.video;
  const slug = video?.slug ?? "";
  const status = video?.status;
  const renders: RenderInfo[] = useMemoRenderArtifacts(videoQuery.data);
  const targetMin = videoQuery.data?.script?.target?.durationMin
    ? Number(videoQuery.data.script.target.durationMin)
    : null;

  const long = renders.find((r) => r.path.endsWith("long.mp4"));
  const shorts = renders.filter((r) => /short-\d+\.mp4$/.test(r.path));

  const deviation =
    long && targetMin ? durationDeviation(long.durationS, targetMin) : null;

  const invalidate = () =>
    void queryClient.invalidateQueries({
      predicate: (q) => String(q.queryKey[0]).includes("VideoService"),
    });

  const approve = useMutation(approveFinalCut, { onSuccess: invalidate });
  const rerender = useMutation(requestRerender, { onSuccess: invalidate });

  const checklistEnabled =
    status === VideoStatus.FINAL_REVIEW || status === VideoStatus.RELEASED;
  const checklistQuery = useQuery(
    getReleaseChecklist,
    { videoId: id },
    { enabled: checklistEnabled && id !== "" }
  );
  const publishMutation = useMutation(setChecklistItemPublished, {
    onSuccess: invalidate,
  });

  const [modal, setModal] = useState<"approve" | "rerender" | null>(null);
  const [rerenderReason, setRerenderReason] = useState("");

  if (videoQuery.isLoading) {
    return <Skeleton className="h-24" aria-busy />;
  }

  if (!video || !slug) {
    return <p className="text-sm text-muted-foreground">Vídeo não encontrado.</p>;
  }

  return (
    <div className="space-y-6" data-testid="final-review-page">
      <VideoPipelineNav
        videoId={id}
        videoSlug={slug}
        status={status}
        currentStage="final"
        extraMeta={
          deviation ? (
            <Badge
              data-testid="target-badge"
              variant={
                deviation.tone === "ok"
                  ? "default"
                  : deviation.tone === "warn"
                    ? "accent"
                    : "destructive"
              }
              title={deviation.detail}
            >
              {deviation.label}: {deviation.detail}
            </Badge>
          ) : null
        }
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {status === VideoStatus.FINAL_REVIEW ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setModal("rerender")}
                  disabled={rerender.isPending}
                >
                  Pedir re-render
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={() => setModal("approve")}
                  disabled={approve.isPending}
                >
                  {approve.isPending ? "gerando release…" : "Aprovar corte"}
                </Button>
              </>
            ) : (
              <span className="self-center text-xs text-muted-foreground">
                Status atual:{" "}
                <strong>
                  {status !== undefined ? presentStatus(status).label : "—"}
                </strong>{" "}
                — ações disponíveis na etapa de revisão final
              </span>
            )}
          </div>
        }
      />

      {approve.isSuccess ? (
        <Alert>
          <AlertDescription>
            Release gerado ({approve.data?.generatedPaths.length ?? 0} arquivos em{" "}
            releases/{slug}/).
          </AlertDescription>
        </Alert>
      ) : null}
      {approve.error ? (
        <Alert variant="destructive">
          <AlertDescription>{approve.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {long ? (
        <section>
          <h2 className="mb-2 font-display text-lg">Long-form</h2>
          <video
            controls
            preload="metadata"
            width={960}
            src={mediaUrl(id, long.path)}
            className="w-full max-w-[960px] rounded-xl border border-border bg-black"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDuration(long.durationS)} · {formatMB(long.bytes)}
          </p>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum render registrado ainda para este vídeo.
        </p>
      )}

      {checklistEnabled && checklistQuery.data ? (
        <Card data-testid="release-checklist">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <CardTitle className="text-lg">Lançamento</CardTitle>
            {(() => {
              const items = checklistQuery.data.items;
              const done = items.filter((i) => i.published).length;
              return (
                <Badge
                  data-testid="checklist-progress"
                  variant={done === items.length ? "default" : "accent"}
                  className="ml-auto"
                >
                  {done}/{items.length} publicados
                </Badge>
              );
            })()}
          </CardHeader>
          <CardContent>
          <ul className="space-y-2">
            {checklistQuery.data.items.map((item) => (
              <li key={item.itemKey} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={item.published}
                  className="h-4 w-4 rounded border-border accent-accent cursor-pointer transition-colors focus:ring-accent"
                  onChange={(e) =>
                    publishMutation.mutate({
                      videoId: id,
                      itemKey: item.itemKey,
                      published: e.target.checked,
                    })
                  }
                  aria-label={`Marcar ${item.label} como publicado`}
                />
                <a
                  href={mediaUrl(id, item.downloadPath)}
                  download
                  className="text-accent hover:underline"
                  title="Baixar pacote"
                >
                  {item.label || item.itemKey}
                </a>
                <span className="font-mono text-xs text-muted-foreground">{item.downloadPath}</span>
                {publishMutation.isPending &&
                publishMutation.variables?.itemKey === item.itemKey ? (
                  <span className="text-xs text-muted-foreground">salvando…</span>
                ) : null}
              </li>
            ))}
          </ul>
          </CardContent>
        </Card>
      ) : null}

      {shorts.length > 0 ? (
        <section>
          <h2 className="mb-2 font-display text-lg">Shorts</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {shorts.map((s) => (
              <figure key={s.path} data-testid="short-card" className="space-y-1">
                <video
                  controls
                  preload="metadata"
                  src={mediaUrl(id, s.path)}
                  className="aspect-[9/16] w-full rounded-lg border border-border bg-black object-cover"
                />
                <figcaption className="text-xs text-muted-foreground">
                  {s.path.split("/").pop()} · {formatDuration(s.durationS)} ·{" "}
                  {formatMB(s.bytes)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {modal === "approve" ? (
        <ConfirmModal
          title="Aprovar corte final?"
          description="Gera releases/<slug>/ completo (YouTube, shorts, sociais e SRT)."
          confirmLabel="Aprovar"
          busy={approve.isPending}
          onConfirm={() =>
            approve.mutate({ videoId: id }, { onSuccess: () => setModal(null) })
          }
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal === "rerender" ? (
        <ConfirmModal
          title="Pedir re-render?"
          description="O vídeo volta para queued e um novo job entra na fila."
          confirmLabel="Re-renderizar"
          busy={rerender.isPending}
          extra={
            <Textarea
              value={rerenderReason}
              onChange={(e) => setRerenderReason(e.target.value)}
              placeholder="Motivo (opcional)"
              rows={2}
            />
          }
          onConfirm={() =>
            rerender.mutate(
              { videoId: id },
              {
                onSuccess: () => {
                  setRerenderReason("");
                  setModal(null);
                },
              }
            )
          }
          onClose={() => setModal(null)}
        />
      ) : null}
    </div>
  );
}

function useMemoRenderArtifacts(data: unknown): RenderInfo[] {
  const renderArtifacts =
    (data as
      | { render_artifacts?: Array<{ path: string; bytes?: bigint; durationS?: number }> }
      | undefined)?.render_artifacts ?? [];
  return renderArtifacts.map((r) => ({
    path: r.path,
    bytes: Number(r.bytes ?? 0),
    durationS: Number(r.durationS ?? 0),
  }));
}

function ConfirmModal(props: {
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  extra?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={props.title} onClose={props.onClose}>
      <p className="text-sm text-muted-foreground">{props.description}</p>
      {props.extra}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={props.onClose}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="accent"
          size="sm"
          onClick={props.onConfirm}
          disabled={props.busy}
        >
          {props.busy ? "processando…" : props.confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

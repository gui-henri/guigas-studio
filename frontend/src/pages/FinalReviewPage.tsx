import { useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import {
  durationDeviation,
  formatDuration,
  formatMB,
} from "../lib/finalReview";

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
    return <div className="h-24 animate-pulse rounded bg-neutral-200/70" aria-busy />;
  }

  if (!video || !slug) {
    return <p className="text-sm text-ink/70">Vídeo não encontrado.</p>;
  }

  return (
    <div className="space-y-5" data-testid="final-review-page">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-ink/60 hover:text-ink">
          ← Fila
        </Link>
        <h1 className="font-serif text-2xl font-semibold">Corte final · {slug}</h1>
        {deviation ? (
          <span
            data-testid="target-badge"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              deviation.tone === "ok"
                ? "bg-added/10 text-added"
                : deviation.tone === "warn"
                  ? "bg-accent/10 text-accent"
                  : "bg-removed/10 text-removed"
            }`}
            title={deviation.detail}
          >
            {deviation.label}: {deviation.detail}
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          {status === VideoStatus.FINAL_REVIEW ? (
            <>
              <button
                type="button"
                onClick={() => setModal("rerender")}
                disabled={rerender.isPending}
                className="rounded-md border border-line px-4 py-2 text-sm hover:border-removed hover:text-removed disabled:opacity-40"
              >
                Pedir re-render
              </button>
              <button
                type="button"
                onClick={() => setModal("approve")}
                disabled={approve.isPending}
                className="rounded-md bg-added px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {approve.isPending ? "gerando release…" : "Aprovar corte"}
              </button>
            </>
          ) : (
            <span className="self-center text-xs text-ink/60">
              status atual: {status} — ações disponíveis só em final_review
            </span>
          )}
        </div>
      </header>

      {approve.isSuccess ? (
        <p className="rounded-lg border border-added/40 bg-surface px-4 py-2 text-sm text-added">
          Release gerado ({approve.data?.generatedPaths.length ?? 0} arquivos em{" "}
          releases/{slug}/).
        </p>
      ) : null}
      {approve.error ? (
        <p className="rounded-lg border border-removed/50 bg-surface px-4 py-2 text-sm text-removed">
          {approve.error.message}
        </p>
      ) : null}

      {long ? (
        <section>
          <h2 className="mb-2 font-serif text-lg">Long-form</h2>
          <video
            controls
            preload="metadata"
            width={960}
            src={mediaUrl(id, long.path)}
            className="w-full max-w-[960px] rounded-xl border border-line bg-black"
          />
          <p className="mt-1 text-xs text-ink/60">
            {formatDuration(long.durationS)} · {formatMB(long.bytes)}
          </p>
        </section>
      ) : (
        <p className="text-sm text-ink/70">
          Nenhum render registrado ainda para este vídeo.
        </p>
      )}

      {checklistEnabled && checklistQuery.data ? (
        <section data-testid="release-checklist" className="rounded-xl border border-line bg-surface p-4">
          <header className="mb-3 flex items-center gap-2">
            <h2 className="font-serif text-lg">Lançamento</h2>
            {(() => {
              const items = checklistQuery.data.items;
              const done = items.filter((i) => i.published).length;
              return (
                <span
                  data-testid="checklist-progress"
                  className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
                    done === items.length
                      ? "bg-added/10 text-added"
                      : "bg-accent/10 text-accent"
                  }`}
                >
                  {done}/{items.length} publicados
                </span>
              );
            })()}
          </header>
          <ul className="space-y-2">
            {checklistQuery.data.items.map((item) => (
              <li key={item.itemKey} className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={item.published}
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
                <span className="font-mono text-xs text-ink/50">{item.downloadPath}</span>
                {publishMutation.isPending &&
                publishMutation.variables?.itemKey === item.itemKey ? (
                  <span className="text-xs text-ink/40">salvando…</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shorts.length > 0 ? (
        <section>
          <h2 className="mb-2 font-serif text-lg">Shorts</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {shorts.map((s) => (
              <figure key={s.path} data-testid="short-card" className="space-y-1">
                <video
                  controls
                  preload="metadata"
                  src={mediaUrl(id, s.path)}
                  className="aspect-[9/16] w-full rounded-lg border border-line bg-black object-cover"
                />
                <figcaption className="text-xs text-ink/60">
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
            <textarea
              value={rerenderReason}
              onChange={(e) => setRerenderReason(e.target.value)}
              placeholder="Motivo (opcional)"
              rows={2}
              className="w-full rounded-md border border-line p-2 text-sm"
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
    <div
      role="dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl bg-paper p-5 shadow-xl">
        <h3 className="font-serif text-xl">{props.title}</h3>
        <p className="text-sm text-ink/70">{props.description}</p>
        {props.extra}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-md border border-line px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.busy}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            {props.busy ? "processando…" : props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

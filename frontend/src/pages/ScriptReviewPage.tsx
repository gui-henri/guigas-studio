import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";

import { getVideo, updateScript, approveScript, rejectScript } from "../gen/app/studio/v1/video-VideoService_connectquery";
import type { Segment } from "../gen/app/studio/v1/script_pb";
import { VideoStatus } from "../gen/app/studio/v1/video_pb";
import SegmentCard, {
  beatLabel,
  emotionLabel,
  type SegmentErrors,
} from "../components/script/SegmentCard";
import ScriptDiff from "../components/script/ScriptDiff";
import Modal from "../components/Modal";
import { useRpcMutation } from "../lib/rpc";
import { presentStatus, statusGroupClasses } from "../lib/videoStatus";

/** Client-side mirror of the S1-02 contract rules (server revalidates anyway). */
function validateSegments(segments: Segment[]): Map<string, SegmentErrors> {
  const errs = new Map<string, SegmentErrors>();
  const seen = new Set<string>();
  let expectedShort = 1;

  for (const seg of segments) {
    const e: SegmentErrors = {};
    if (!seg.id) errs.set(seg.id || "?", { narration: "id ausente" });
    if (seen.has(seg.id)) e.narration = `id duplicado: ${seg.id}`;
    seen.add(seg.id);
    if (!seg.narrationPt.trim()) e.narration = "narração obrigatória";
    if (seg.short) {
      if (!seg.short.hook.trim()) e.shortHook = "hook obrigatório";
      if (!seg.short.cta.trim()) e.shortCta = "cta obrigatório";
      if (seg.short.id !== expectedShort) {
        e.shortHook ??= `short fora de sequência (esperado #${expectedShort})`;
      }
      expectedShort++;
    }
    if (Object.keys(e).length > 0) errs.set(seg.id, e);
  }
  return errs;
}

export default function ScriptReviewPage() {
  const { id = "" } = useParams();
  const [showDiff, setShowDiff] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Segment[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<"approve" | "reject" | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const { data, isLoading, error, refetch, isRefetching } = useQuery(getVideo, { id });

  const script = data?.script;
  const original = data?.originalScript;
  const shortCount = script?.segments.filter((s) => s.short).length ?? 0;

  const changedIds = useMemo(() => {
    if (!script || !original) return new Set<string>();
    const origById = new Map(original.segments.map((s) => [s.id, s]));
    return new Set(
      script.segments
        .filter((seg) => origById.get(seg.id)?.narrationPt !== seg.narrationPt)
        .map((seg) => seg.id)
    );
  }, [script, original]);

  const { mutate: doUpdate, isPending: saving } = useRpcMutation(updateScript, {
    invalidate: [getVideo],
    onSuccess: (res) => {
      if (res.errors.length === 0) {
        setToast("Roteiro salvo.");
        setEditing(false);
        setDrafts(null);
      }
    },
  });
  const { mutate: doApprove, isPending: approving } = useRpcMutation(approveScript, {
    invalidate: [getVideo],
    onSuccess: () => {
      setToast("Roteiro aprovado — gravação liberada.");
      setModal(null);
    },
  });
  const { mutate: doReject, isPending: rejecting } = useRpcMutation(rejectScript, {
    invalidate: [getVideo],
    onSuccess: () => {
      setToast("Rejeitado: o OpenCode volta a ser o próximo passo.");
      setModal(null);
      setRejectComment("");
    },
  });

  // Reset local draft whenever fresh data arrives and we are not editing.
  useEffect(() => {
    if (!editing && script) setDrafts(null);
  }, [script, editing]);

  const draftSegments = drafts ?? script?.segments ?? [];
  const fieldErrors = useMemo(
    () => (editing ? validateSegments(draftSegments) : new Map<string, SegmentErrors>()),
    [editing, draftSegments]
  );
  const canSave =
    editing && fieldErrors.size === 0 && !saving && draftSegments.length > 0;

  function startEditing() {
    setDrafts(script?.segments.map((s) => ({ ...s })) ?? []);
    setEditing(true);
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!script || !drafts) return;
    doUpdate({ videoId: id, script: { ...script, segments: drafts } });
  }

  function handleApprove() {
    void refetch();
    doApprove({ videoId: id });
  }

  function handleReject(e: FormEvent) {
    e.preventDefault();
    if (!rejectComment.trim()) return;
    doReject({ videoId: id, comment: rejectComment });
  }

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy>
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-24 animate-pulse rounded-lg bg-neutral-200/70" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">Falha ao carregar vídeo: {error.message}</p>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isRefetching}
          className="mt-2 rounded border border-red-300 px-3 py-1 text-xs hover:bg-red-100 disabled:opacity-50"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const video = data?.video;
  if (!video) {
    return <p className="text-sm text-neutral-500">Vídeo não encontrado.</p>;
  }

  if (!script) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
        Nenhum <code className="font-mono">script.json</code> válido ainda. Abra uma sessão
        do OpenCode dentro de{" "}
        <code className="font-mono">videos/{video.slug}/</code> e escreva o roteiro (ver{" "}
        <span className="font-mono">context/AGENTS.md</span>). Esta tela atualiza sozinha
        quando o agente salvar.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-ink/60 hover:text-ink">
          ← Fila
        </Link>
        <h1 className="font-serif text-2xl font-semibold">{video.slug}</h1>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            statusGroupClasses[presentStatus(video.status).group]
          }`}
        >
          {presentStatus(video.status).label}
        </span>
        {script.target && (
          <span className="text-xs text-ink/50">alvo: {script.target.durationMin} min</span>
        )}
        <span className="text-xs text-ink/50">
          {shortCount} short{shortCount === 1 ? "" : "s"}
        </span>

        {!editing && video.status === VideoStatus.SCRIPT_REVIEW && (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={startEditing}
              className="rounded border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setModal("reject")}
              className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-800 hover:bg-red-50"
            >
              Rejeitar
            </button>
            <button
              type="button"
              onClick={() => setModal("approve")}
              className="rounded bg-accent px-3 py-1.5 text-xs text-paper hover:opacity-90"
            >
              Aprovar
            </button>
          </div>
        )}
      </header>

      {toast && (
        <div className="rounded border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {toast}
        </div>
      )}

      {editing && (
        <form onSubmit={handleSave} className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded bg-accent px-4 py-1.5 text-xs text-paper hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setDrafts(null);
            }}
            className="rounded border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5"
          >
            Descartar
          </button>
          {fieldErrors.size > 0 && (
            <span className="text-xs text-red-700">
              Corrija os campos destacados antes de salvar.
            </span>
          )}
        </form>
      )}

      <div className="flex flex-col-reverse gap-5 lg:flex-row">
        <nav className="lg:w-52 lg:shrink-0" aria-label="Segmentos">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {draftSegments.map((seg) => (
              <li key={seg.id}>
                <a
                  href={`#segment-${seg.id}`}
                  className={`block rounded px-3 py-2 text-xs hover:bg-ink/5 ${
                    changedIds.has(seg.id) ? "" : "text-ink/70"
                  }`}
                >
                  {changedIds.has(seg.id) && <span title="alterado">● </span>}
                  <span className="font-mono">{seg.id}</span>
                  <span className="ml-1 hidden text-ink/40 sm:inline">{beatLabel(seg.beat)}</span>
                  <span className="ml-1 hidden text-ink/30 md:inline">{emotionLabel(seg.emotion)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 space-y-3">
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input
              type="checkbox"
              checked={showDiff}
              onChange={(e) => setShowDiff(e.target.checked)}
              disabled={editing}
            />
            Mostrar diff vs. original do agente
          </label>

          {showDiff && !editing && original && (
            <ScriptDiff original={original} current={script} />
          )}

          {draftSegments.map((seg) => (
            <SegmentCard
              key={seg.id}
              segment={seg}
              changed={changedIds.has(seg.id)}
              editing={editing}
              errors={fieldErrors.get(seg.id)}
              onChange={(next) =>
                setDrafts((prev) =>
                  (prev ?? []).map((d) => (d.id === seg.id ? next : d))
                )
              }
            />
          ))}
        </div>
      </div>

      {modal === "approve" && (
        <Modal title="Aprovar roteiro?" onClose={() => setModal(null)}>
          <p className="text-sm text-ink/70">
            O vídeo vai para <span className="font-mono">script_approved</span> e a fila de
            gravação é liberada.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="rounded border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={approving}
              className="rounded bg-accent px-3 py-1.5 text-xs text-paper hover:opacity-90 disabled:opacity-40"
            >
              {approving ? "Aprovando…" : "Confirmar aprovação"}
            </button>
          </div>
        </Modal>
      )}

      {modal === "reject" && (
        <Modal title="Rejeitar roteiro" onClose={() => setModal(null)}>
          <form onSubmit={handleReject}>
            <p className="text-sm text-ink/70">
              O vídeo volta para <span className="font-mono">script_pending</span>: o
              OpenCode retoma o trabalho a partir do seu comentário.
            </p>
            <textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={4}
              required
              placeholder="O que precisa mudar no roteiro?"
              className="mt-3 w-full rounded border border-ink/20 p-3 text-sm focus:border-ink focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={rejecting || !rejectComment.trim()}
                className="rounded bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-800 disabled:opacity-40"
              >
                {rejecting ? "Rejeitando…" : "Confirmar rejeição"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

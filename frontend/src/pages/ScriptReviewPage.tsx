import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";

import { getVideo, generateScript, updateScript, approveScript, rejectScript } from "../gen/app/studio/v1/video-VideoService_connectquery";
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
import { presentStatus } from "../lib/videoStatus";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Skeleton } from "../components/ui/skeleton";
import { Textarea } from "../components/ui/textarea";

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
      setToast("Rejeitado: a geração automática retoma a partir do seu comentário.");
      setModal(null);
      setRejectComment("");
    },
  });
  const {
    mutate: doGenerate,
    isPending: generating,
    data: generation,
    error: generationError,
    reset: resetGeneration,
  } = useRpcMutation(generateScript, {
    invalidate: [getVideo],
    onSuccess: (res) => {
      if (res.errors.length === 0 && res.script) {
        setToast("Roteiro gerado pela IA — revise abaixo.");
      }
    },
  });
  const generationErrors: string[] = generation
    ? [...generation.errors]
    : generationError
      ? [generationError.message]
      : [];

  // Reset local draft whenever fresh data arrives and we are not editing.
  useEffect(() => {
    if (!editing && script) setDrafts(null);
  }, [script, editing]);

  const draftSegments = useMemo(
    () => drafts ?? script?.segments ?? [],
    [drafts, script]
  );
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
          <Skeleton key={n} className="h-24" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Falha ao carregar vídeo: {error.message}</AlertDescription>
        <div className="mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isRefetching}
          >
            Tentar de novo
          </Button>
        </div>
      </Alert>
    );
  }

  const video = data?.video;
  if (!video) {
    return <p className="text-sm text-muted-foreground">Vídeo não encontrado.</p>;
  }

  if (!script) {
    const canGenerate =
      video.status === VideoStatus.SCRIPT_PENDING ||
      video.status === VideoStatus.SCRIPT_REVIEW;
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            Nenhum <code className="font-mono">script.json</code> válido ainda. A geração
            automática via Gemini roda após o watcher criar o vídeo; se falhar, use o
            botão abaixo ou abra uma sessão manual dentro de{" "}
            <code className="font-mono">videos/{video.slug}/</code> (ver{" "}
            <span className="font-mono">context/AGENTS.md</span>). Esta tela atualiza
            sozinha quando o roteiro for salvo.
          </AlertDescription>
        </Alert>
        {canGenerate && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="accent"
              disabled={generating}
              onClick={() => {
                resetGeneration();
                doGenerate({ videoId: id });
              }}
            >
              {generating ? "Gerando roteiro… (pode levar minutos)" : "Gerar roteiro com IA"}
            </Button>
            {generating && (
              <span className="text-xs text-muted-foreground">
                A IA está escrevendo os segmentos — aguarde sem recarregar.
              </span>
            )}
          </div>
        )}
        {generationErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              Falha na geração:
              <ul className="mt-1 list-disc pl-5">
                {generationErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Fila
        </Link>
        <h1 className="font-display text-2xl font-semibold">{video.slug}</h1>
        <Badge variant="secondary">
          {presentStatus(video.status).label}
        </Badge>
        <nav className="ml-auto flex items-center gap-2 text-sm">
          {(video.status === VideoStatus.RECORDING ||
            video.status === VideoStatus.SCRIPT_APPROVED) && (
            <Link to={`/videos/${video.slug}/studio`}>
              <Button variant="default" size="sm">Estúdio 🎙️</Button>
            </Link>
          )}
          <Link to={`/videos/${video.id}/voz`}>
            <Button variant="outline" size="sm">Voz</Button>
          </Link>
          <Link to={`/videos/${video.id}/final`}>
            <Button variant="outline" size="sm">Corte</Button>
          </Link>
        </nav>
        {script.target && (
          <span className="text-xs text-muted-foreground">alvo: {script.target.durationMin} min</span>
        )}
        <span className="text-xs text-muted-foreground">
          {shortCount} short{shortCount === 1 ? "" : "s"}
        </span>

        {!editing && video.status === VideoStatus.SCRIPT_REVIEW && (
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={generating}
              title="Regenera o roteiro com a IA (sobrescreve o atual)"
              onClick={() => {
                resetGeneration();
                doGenerate({ videoId: id });
              }}
            >
              {generating ? "Gerando…" : "Regenerar com IA"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={startEditing}>
              Editar
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => setModal("reject")}>
              Rejeitar
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={() => setModal("approve")}>
              Aprovar
            </Button>
          </div>
        )}
      </header>

      {generationErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Falha na geração:
            <ul className="mt-1 list-disc pl-5">
              {generationErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {(video.status === VideoStatus.RECORDING ||
        video.status === VideoStatus.SCRIPT_APPROVED) && (
        <Alert>
          <AlertDescription>
            <span className="font-medium">Roteiro aprovado! O estúdio de gravação está pronto. </span>
            <span className="text-xs">Conecte seu microfone e câmera para gravar os takes e blendshapes. </span>
            <Link to={`/videos/${video.slug}/studio`} className="ml-2 inline-block">
              <Button variant="accent" size="sm">Abrir Estúdio de Gravação →</Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {toast && (
        <Alert>
          <AlertDescription>{toast}</AlertDescription>
        </Alert>
      )}

      {editing && (
        <form onSubmit={handleSave} className="flex items-center gap-3">
          <Button type="submit" variant="accent" size="sm" disabled={!canSave}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(false);
              setDrafts(null);
            }}
          >
            Descartar
          </Button>
          {fieldErrors.size > 0 && (
            <span className="text-xs text-destructive">
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
                  className="block rounded px-3 py-2 text-xs hover:bg-muted text-muted-foreground"
                >
                  {changedIds.has(seg.id) && <span title="alterado">● </span>}
                  <span className="font-mono">{seg.id}</span>
                  <span className="ml-1 hidden text-muted-foreground sm:inline">{beatLabel(seg.beat)}</span>
                  <span className="ml-1 hidden text-muted-foreground/70 md:inline">{emotionLabel(seg.emotion)}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 space-y-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
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
          <p className="text-sm text-muted-foreground">
            O vídeo vai para <span className="font-mono">script_approved</span> e a fila de
            gravação é liberada.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={handleApprove} disabled={approving}>
              {approving ? "Aprovando…" : "Confirmar aprovação"}
            </Button>
          </div>
        </Modal>
      )}

      {modal === "reject" && (
        <Modal title="Rejeitar roteiro" onClose={() => setModal(null)}>
          <form onSubmit={handleReject}>
            <p className="text-sm text-muted-foreground">
              O vídeo volta para <span className="font-mono">script_pending</span>: a
              geração automática retoma a partir do seu comentário.
            </p>
            <Textarea
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={4}
              required
              placeholder="O que precisa mudar no roteiro?"
              className="mt-3"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" size="sm" disabled={rejecting || !rejectComment.trim()}>
                {rejecting ? "Rejeitando…" : "Confirmar rejeição"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

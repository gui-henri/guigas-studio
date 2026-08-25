import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@connectrpc/connect-query";

import { getVideo } from "../gen/app/studio/v1/video-VideoService_connectquery";
import SegmentCard, { beatLabel, emotionLabel } from "../components/script/SegmentCard";
import ScriptDiff from "../components/script/ScriptDiff";
import { presentStatus, statusGroupClasses } from "../lib/videoStatus";

export default function ScriptReviewPage() {
  const { id = "" } = useParams();
  const [showDiff, setShowDiff] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

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
      </header>

      <div className="flex flex-col-reverse gap-5 lg:flex-row">
        {/* Segment rail */}
        <nav className="lg:w-52 lg:shrink-0" aria-label="Segmentos">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {script.segments.map((seg) => (
              <li key={seg.id}>
                <a
                  href={`#segment-${seg.id}`}
                  onClick={() => setSelected(seg.id)}
                  className={`block rounded px-3 py-2 text-xs hover:bg-ink/5 ${
                    selected === seg.id ? "bg-ink/10 font-semibold" : "text-ink/70"
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
            />
            Mostrar diff vs. original do agente
          </label>

          {showDiff && original && (
            <ScriptDiff original={original} current={script} />
          )}

          {script.segments.map((seg) => (
            <SegmentCard key={seg.id} segment={seg} changed={changedIds.has(seg.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

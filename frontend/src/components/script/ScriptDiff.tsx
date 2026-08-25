import { diffWords } from "diff";
import type { StudioScript, Segment } from "../../gen/app/studio/v1/script_pb";

function narrationChanged(a: Segment | undefined, b: Segment): boolean {
  if (!a) return true;
  return a.narrationPt !== b.narrationPt;
}

/** Inline word diff of one narration field. */
export function NarrationDiff({ original, current }: { original: string; current: string }) {
  const parts = diffWords(original, current);
  return (
    <p className="font-serif text-base leading-relaxed">
      {parts.map((part, i) =>
        part.added ? (
          <ins key={i} className="bg-emerald-100 text-emerald-900 no-underline">
            {part.value}
          </ins>
        ) : part.removed ? (
          <del key={i} className="bg-red-100 text-red-900">
            {part.value}
          </del>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </p>
  );
}

/**
 * Side-by-side panel comparing the frozen agent original with the current
 * script, field by field (narration_pt), per segment.
 */
export default function ScriptDiff({
  original,
  current,
}: {
  original: StudioScript;
  current: StudioScript;
}) {
  const byId = new Map<string, Segment>();
  for (const seg of original.segments) byId.set(seg.id, seg);

  const changedIds = current.segments.filter(
    (seg) => narrationChanged(byId.get(seg.id), seg) || !byId.has(seg.id)
  );

  if (changedIds.length === 0) {
    return (
      <p className="rounded-lg border border-ink/10 bg-white/60 p-4 text-sm text-ink/70">
        Nenhuma diferença entre o roteiro original do agente e a versão atual.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {changedIds.map((seg) => {
        const orig = byId.get(seg.id);
        return (
          <div
            key={seg.id}
            className="grid gap-3 rounded-lg border border-ink/10 bg-white p-4 md:grid-cols-2"
          >
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                Original (agente)
              </span>
              <p className="mt-1 font-serif text-base leading-relaxed text-ink/60">
                {orig?.narrationPt ?? "— segmento novo —"}
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
                Atual
              </span>
              <div className="mt-1">
                {orig ? (
                  <NarrationDiff original={orig.narrationPt} current={seg.narrationPt} />
                ) : (
                  <p className="font-serif text-base leading-relaxed">{seg.narrationPt}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

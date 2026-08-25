import { useState } from "react";

import Teleprompter from "../features/studio/Teleprompter";

const SEGMENTS = [
  { id: "hook", narration: "Este é o gancho: em quinze segundos você vai entender por que tudo que você sabia sobre X mudou." },
  { id: "setup", narration: "Contexto mínimo: a ferramenta existia, o problema também — faltava juntar as duas pontas sem explodir o custo." },
  { id: "payoff", narration: "O insight transferível: quando o gargalo muda de lugar, a arquitetura inteira vira candidata a simplificação." },
];

/** Dev-only page for the teleprompter flow (S2-06). */
export default function TeleprompterDevPage() {
  const [idx, setIdx] = useState(0);
  const seg = SEGMENTS[idx];

  return (
    <div className="mx-auto max-w-2xl p-8">
      <Teleprompter
        segmentId={seg.id}
        narration={seg.narration}
        onPrev={idx > 0 ? () => setIdx(idx - 1) : undefined}
        onNext={idx < SEGMENTS.length - 1 ? () => setIdx(idx + 1) : undefined}
        renderExtra={<p className="text-xs text-ink/40">(slot do avatar vivo na S2-07)</p>}
        onTakeReady={(take) =>
          console.log("take pronto:", take.durationMs, "ms")
        }
      />
      <p className="mt-6 text-xs text-ink/50">
        segmento {idx + 1}/{SEGMENTS.length} · takes ficam locais (nada sobe aqui)
      </p>
    </div>
  );
}

---
id: S5-10
titulo: "UI de revisão final consolidada (aprovar / re-render)"
sprint: 5
prioridade: P0
depende_de: [S5-07]
estimativa_h: 2
status: todo
---

# S5-10 — Revisão final consolidada na UI

## Objetivo

Página de revisão final no dashboard: player do long + shorts lado a lado, durações e
tamanhos exibidos, comparação com o alvo de duração do script (`target.durationMin`) e
ações **Aprovar** (dispara o release builder) / **Re-render** — a cabine de controle
humana antes do lançamento.

## Contexto

SPEC §4.6 ("revisão final: player do corte completo → aprova"). Consolida o player
mínimo da S5-07 numa tela única, usando metadados dos artifacts gravados em PG
(duration_s/bytes da S5-07) e RPCs `ApproveFinalCut`/`RequestRerender`. Padrão de
mutação/invalidação via TanStack Query + SSE (S1-05, D-03). Estado do vídeo:
`final_review` (saídas → `released` via checklist S5-11 ou `queued` no re-render).

## Pré-requisitos

- S5-07 `done` (players mínimos, RPCs, transição re-render testada).
- Vídeo em `final_review` com long + ≥1 short para validar visualmente.

## Passos

1. Criar rota/página `FinalReviewPage` (só acessível quando status = `final_review`;
   guard segue padrão das páginas de review anteriores).
2. Layout consolidado: linha superior com player grande do long; abaixo, faixa
   horizontal com um card por short (`<video>` + nome `short-N`).
3. Cada card exibe duração (`duration_s` formatado mm:ss) e tamanho humanizado
   (`bytes` → MB) lidos dos metadados em PG (GetVideo detalhado estendido se preciso).
4. Header com comparação de alvo: duração do long vs `script.target.durationMin`
   (min) → badge "±Xs do alvo" (verde ≤60 s, amarelo ≤180 s, vermelho acima).
5. Ação **Aprovar**: modal de confirmação → mutation `ApproveFinalCut` → toast +
   SSE atualiza cards (release builder S5-09 roda; página mostra paths gerados).
6. Ação **Pedir re-render**: modal com campo opcional de motivo →
   `RequestRerender` → vídeo volta a `queued`; UI reflete transição via SSE.
7. Estados de loading/disabled nos botões enquanto builder/job transitam; erro de RPC
   mostra motivo estruturado (ex.: vídeo bloqueado).

## Critérios de aceite

- [ ] Long e todos os shorts tocam lado a lado sem recarregar a página
- [ ] Duração/tamanho de cada render visíveis; badge de desvio vs alvo correto
- [ ] Aprovar dispara o builder e a UI reflete os artefatos gerados
- [ ] Pedir re-render retorna o vídeo a `queued` com novo job (`rerender=true`)
- [ ] lint+build do frontend limpos; nenhum estado morto/travado após SSE

## Verificação

```bash
npm run check
npm run build --workspaces --if-present
# manual guiado: colocar vídeo fixture em final_review e exercitar aprovação/re-render
```

## Notas

- Não baixar MP4 inteiro para memória: `<video>` com URL autenticada + Range (S5-07)
  faz streaming; evitar `fetch`→blob para arquivos grandes.
- Badge de alvo é orientação humana, não validação dura: nunca bloquear aprovação por
  desvio (decisão final é sempre do dono).
- Se `target.durationMin` não existir no script antigo, esconder badge (campo opcional
  do StudioScript — não inventar default).

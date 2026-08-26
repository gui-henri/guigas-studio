---
id: S4-09
titulo: "Stills de snapshot dos componentes (regressão visual)"
sprint: 4
prioridade: P2
depende_de: [S4-02, S4-03, S4-04]
estimativa_h: 2status: done
---

# S4-09 — Stills de snapshot dos componentes

## Objetivo

Criar regressão visual básica: stills dos 7 componentes da biblioteca gerados com
`remotion still` (CI local via npm script), comparados contra baselines commitadas com
tolerância configurável. Alterar token, quebrar layout ou mudar timing visível deve
quebrar o snapshot correspondente.

## Contexto

D-18 pede testes moderados; render visual não cabe em unit test, mas stills baratos
pegam as regressões mais comuns (cor, espaçamento, frame errado). Os stills também
fornecem os prints prometidos no catálogo (`docs/guides/scene-catalog.md`, S4-01).
Roda na máquina local (Windows nativo, D-13) — NÃO no GitHub Actions, onde antialiasing
de fonte diverge das baselines.

## Pré-requisitos

- S4-02..S4-04 entregues: 7 componentes com fixtures válidas em `remotion-kit/fixtures/`.
- Remotion instalado no workspace `remotion-kit` (scaffold S3-06).

## Passos

1. Criar `remotion-kit/src/snapshots/Root.tsx`: registro com 7 `<Composition id="snap-
   <componente>">` (960×540, 30 fps, ~2 s) cujas props vêm dos fixtures — entry point
   dedicado aos snapshots, separado da composição raiz da S3-06.
2. Escolher por componente um FRAME representativo nos props da Composition (meio do
   typing parcial, diff completo, terminal com 3 linhas visíveis, diagrama com arestas
   pela metade…) — frames finais demais escondem bugs de timing.
3. Criar `remotion-kit/scripts/snapshot.mjs`: para cada fixture executa
   `npx remotion still <entry> <composition-id> <out.png> --frame=<N>`, compara com
   `__snapshots__/baseline/<id>.png` via pixelmatch, tolerância por env
   `SNAPSHOT_TOLERANCE` (default `0.1`); sai 1 com lista de divergências.
4. Adicionar scripts no `package.json` do remotion-kit: `snapshots` (comparar, falhar se
   acima da tolerância) e `snapshots:update` (regenerar baselines).
5. Gerar baselines iniciais e commitá-las (`__snapshots__/baseline/*.png`) — PNGs
   960×540 são pequenos; os ignorões de mídia pesada (D-11) não se aplicam a eles.
6. Inserir cada still como print na seção correspondente do `scene-catalog.md`
   (substituindo os placeholders da S4-01).

## Critérios de aceite

- [x] `npm run snapshots -w remotion-kit` verde com baselines atuais (7/7, 0.00%)
- [x] Mudança proposital de token quebra os snapshots afetados (accent→verde: flow-diagram 0.61% e big-number 0.75% falham; exit 1)
- [x] Tolerância ajustável via `SNAPSHOT_TOLERANCE` (default 0.5% — 10% inicial não pegava regressões de cor)
- [x] Baselines commitadas (`__snapshots__/baseline/`, 960×540) e entry isolado (src/snapshots/index.ts, ids sem underscore por exigência do Remotion)
- [x] Catálogo exibe print real para os 7 componentes (placeholders substituídos)

## Verificação

```bash
npm run check
npm run snapshots -w remotion-kit
ls remotion-kit/__snapshots__/baseline | wc -l   # ≥ 7
```

## Notas

## Notas

- Tolerância default calibrada de 0.1 → 0.005 após teste: com 10% a mudança do token
  accent passava despercebida. Antialiasing entre renders da MESMA máquina é ~0%.
- Composition ids usam hífen (Remotion rejeita underscore).
- Antialiasing varia entre SO/GPU/driver: por isso comparação com tolerância e execução
  SEMPRE na mesma máquina que gerou as baselines (local, D-13). Se mudar de máquina,
  regenerar baselines uma vez com `snapshots:update` e committar explicando o motivo.
- Divergência legítima (mudança de design intencional): atualizar baseline + catálogo no
  mesmo commit da mudança.
- Manter resolução 960×540 nas baselines: suficiente para pegar regressão sem pesar no git.

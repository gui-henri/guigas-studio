---
id: S4-03
titulo: "Componentes TerminalRun e Callout"
sprint: 4
prioridade: P1
depende_de: [S4-01]
estimativa_h: 2
status: todo
---

# S4-03 — Componentes TerminalRun e Callout

## Objetivo

Adicionar `TerminalRun` (linhas surgindo como execução real, com cursor e prompt) e
`Callout` (título + texto + ícone, variantes) à biblioteca de cenas (SPEC §4.5), seguindo
exatamente as convenções estabelecidas na S4-02: props da gramática fechada, tokens do
blog via `theme.ts`, funções puras testadas e fixtures para stills.

## Contexto

Segundo par de componentes do kit. Mesmo contrato da S4-02 — determinismo frame-based,
zero CSS livre, bundle enxuto para o Player na SPA (T-02). Estes dois não bloqueiam o
compositor (S4-05 depende só de S4-02), mas fecham o kit exigido pelo SPEC §4.5.

## Pré-requisitos

- S4-01 com `sceneSchema` (`terminal_run`, `callout`) e defaults aplicados.
- Convenções da S4-02 vigentes: `theme.ts`, fixtures em `remotion-kit/fixtures/`,
  testes com vitest.

## Passos

1. Função pura `visibleTerminalLines(lines, frame, fps)` em
   `src/scenes/terminal-run/progress.ts`: dado o array de linhas (com `delayFrames`
   opcional por linha), retorna quais linhas estão visíveis e o texto parcial da linha
   em digitação — testada (casos: delays acumulados, linha parcial, todas visíveis).
2. `<TerminalRun>` consumindo props do schema: janela com barra de título, prompt
   (default `$`), linhas por `kind` (`command` | `output` | `success` | `error`) com
   cores dos tokens, cursor piscante reusando `isCursorVisible` da S4-02.
3. Set de ícones fixo inline SVG (info/warn/success/idea) em
   `src/scenes/callout/icons.tsx` — sem biblioteca de ícones.
4. `<Callout>` consumindo props do schema: variante mapeia borda/fundo/ícone pelos
   tokens; título em serif, corpo legível; animação única de entrada (fade/slide por frame).
5. Fixtures válidas contra o schema: `remotion-kit/fixtures/terminal-run.json` (mistura
   de kinds) e `callout.json` (uma fixture por variante) — validadas num teste.

## Critérios de aceite

- [ ] Terminal revela linhas estritamente pela função pura do frame (scrub ok no Player)
- [ ] Cursor pisca determinístico; nenhum timer/setInterval
- [ ] Callout tem as 4 variantes renderizando com cores/ícones dos tokens
- [ ] Funções puras testadas; fixtures validam contra `sceneSchema` (D-18)
- [ ] Nenhum hex literal fora de `theme.ts`

## Verificação

```bash
npm run check
npm run test -w remotion-kit -- src/scenes/terminal-run src/scenes/callout
rg -n "setInterval|setTimeout|Math.random" remotion-kit/src/scenes && exit 1 || echo OK
```

## Notas

- `delayFrames` por linha é a forma simples de ritmo (pausa entre comando e saída);
  não inventar engine de timing genérica.
- Se um `kind` novo fizer falta (ex.: `warning`), estreitar/ampliar o schema da S4-01 no
  mesmo commit com teste — nunca estilizar via prop livre.
- Ícones são SVGs mínimos desenhados à mão (stroke herdado do token ink): evitam dependência
  e mantêm o estilo coerente com o blog.

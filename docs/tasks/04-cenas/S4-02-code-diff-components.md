---
id: S4-02
titulo: "Componentes CodeTyping e DiffView com tokens do blog"
sprint: 4
prioridade: P0
depende_de: [S4-01]
estimativa_h: 2
status: todo
---

# S4-02 — Componentes CodeTyping e DiffView

## Objetivo

Implementar os dois primeiros componentes da biblioteca (SPEC §4.5): `CodeTyping`
(typing effect determinístico frame-based com highlight leve) e `DiffView`
(before/after com destaque de linhas), ambos tematizados com os design tokens do blog,
props tipados pela gramática S4-01 e fixtures de still render para a S4-09.

## Contexto

Identidade visual vem dos tokens do blog (SPEC §2 #10, tema da S0-11) — warm paper,
muted ink, serif/mono. O `<Player>` roda dentro da SPA (T-02), então dependências pesadas
de highlight são vetadas. Determinismo é requisito do render final (Remotion executa
frames fora de ordem/em paralelo): nada de `Math.random` ou `Date.now`.

## Pré-requisitos

- S4-01 com `sceneSchema` e tipos exportados (`code_typing`, `diff_view`).
- Valores dos tokens definidos na S0-11 (frontend) para espelhamento.

## Passos

1. Criar `remotion-kit/src/theme.ts` exportando os tokens (cores paper/ink/accent,
   famílias serif/mono) espelhando a S0-11 — fonte única de estilo para TODOS os
   componentes de cena; nenhum hex hardcoded nos componentes.
2. Funções puras em `src/scenes/code-typing/progress.ts`: `charsVisible(frame, fps,
   totalChars, charsPerSecond)` e `isCursorVisible(frame, periodFrames)` (blink por
   paridade de frame) — testadas.
3. Tokenizador regex leve próprio em `src/scenes/code-typing/highlight.ts`
   (keywords/strings/comments/números) retornando spans tipados — sem shiki/prism/monaco.
4. `<CodeTyping>` consumindo props do schema: código aparece caractere a caractere
   conforme `useCurrentFrame`, cursor piscando, highlight aplicado ao trecho visível.
5. Função pura `diffLines(before, after)` em `src/scenes/diff-view/diff.ts`
   (alinhamento simples linha a linha) marcando context/added/removed — testada.
6. `<DiffView>` com painéis before/after lado a lado, gutters coloridos por tipo de
   linha e título opcional.
7. Fixtures válidas contra o schema: `remotion-kit/fixtures/code-typing.json` e
   `diff-view.json` (validadas num teste) — insumo dos stills da S4-09.

## Critérios de aceite

- [ ] Dois renders do mesmo frame produzem pixels idênticos (determinismo)
- [ ] Zero uso de `Math.random`/`Date.now` nos componentes (variação seeded usa `random()` do Remotion)
- [ ] Todo estilo vem de `theme.ts`; nenhum hex literal nos componentes
- [ ] Funções puras (`charsVisible`, `isCursorVisible`, `diffLines`) com unit tests (D-18)
- [ ] Fixtures validam contra `sceneSchema`

## Verificação

```bash
npm run check
npm run test -w remotion-kit -- src/scenes/code-typing src/scenes/diff-view
rg -n "Math.random|Date\.now" remotion-kit/src/scenes && exit 1 || echo OK
```

## Notas

- Highlight leve é decisão consciente: o bundle entra na SPA via Player (T-02). Se a
  qualidade ficar insuficiente em produção, registrar atrito e avaliar prism sob demanda —
  não antecipar aqui.
- Typing deve ser função pura do frame (não timer/setState): é o que garante scrub
  correto no `<Player>` e render estável.
- Cuidado com tabs/espaços misturados nos fixtures — normalizar whitespace na entrada
  para o highlight não deslocar colunas.

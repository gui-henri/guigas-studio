---
id: S5-06
titulo: "Shorts 9:16 no mesmo job do long"
sprint: 5
prioridade: P0
depende_de: [S5-05]
estimativa_h: 2
status: done
---

# S5-06 — Shorts 9:16 (re-corte vertical)

## Objetivo

Para cada marca `[SHORT#n]` do `script.json`, renderizar a composição `Short`
(1080×1920: hook + exemplo + CTA, legendas maiores) **no mesmo job** do long-form,
com falha de short individual não derrubando o long; número de shorts renderizados =
contagem exata de marcas.

## Contexto

SPEC §4.6 ("re-corte 9:16 dos segmentos [SHORT#n] no mesmo job"). A contagem esperada
(`expected_shorts`) foi calculada no enqueue (S5-01) e viaja no payload do job. Reusa
bundle, inputs e pipeline da S5-05; saída local em `out/short-N.mp4` (upload é S5-07).

## Pré-requisitos

- S5-05 `done` (stage de long funcionando com progresso).
- Vídeo fixture com ≥1 marca `[SHORT#1]` válida no script.

## Passos

1. `src/script/shorts.ts`: parser puro que extrai os segmentos marcados `[SHORT#n]`
   do `script.json` na ordem, validando sequência 1..N sem buracos. Unit test (D-18).
2. Conferir contagem contra `expected_shorts` do payload; divergência →
   `FailJob(retryable=false)` com motivo claro (script mudou após aprovação — humano
   precisa reaprovar cenas).
3. Composição `Short` em `remotion-kit/`: mesma gramática de cenas (S4-01), frame
   1080×1920, subconjunto hook+exemplo+CTA do short, legenda EN com escala maior
   (prop `captionScale`), áudio apenas dos segmentos do short.
4. `src/stages/shorts.ts`: loop sequencial pelos shorts — para cada `n`,
   `selectComposition(Short)` + `renderMedia` → `out/short-N.mp4`; reportar stage
   `short_n` com percent próprio.
5. Isolamento de falha: `try/catch` por short — erro registra
   `warnings[] += "short-N: <motivo>"`, continua o próximo; o long NUNCA é afetado.
6. Fim do stage: se ≥1 short falhou, seguir para upload mesmo assim levando as
   `warnings` no `CompleteJob` (humano decide re-render na revisão final — S5-10);
   zero marks no script → job termina só com o long (caso válido).

## Critérios de aceite

- [x] N marcas → short-1..N.mp4 1080×1920 (composição Short real = LongFormVideo vertical com subconjunto de props do corte)
- [x] Falha por-short isolada em try/catch: warning `short-N: <motivo>` acumulada em ctx.warnings e enviada no CompleteJob; long nunca afetado
- [x] Contagem ≠ expected_shorts do payload → NonRetryableError (FailJob retryable=false)
- [x] Progresso por curto reportado como stage short_N (percent próprio, throttle por ponto inteiro)
- [x] Parser planShorts unit-testado: agrupamento, zero marcas, buracos, fora de ordem, repetição inline no mesmo segmento (6 casos)

## Verificação

```bash
npm run check
npm run test -w runner -- --run src/script/shorts   # ou go-style equivalente vitest
npm run dev -w runner   # job fixture: out/long.mp4 + out/short-*.mp4
ffprobe -v error -show_entries stream=width,height -of csv out/short-1.mp4
```

## Notas

- Render sequencial dos shorts de propósito: paralelizar dois `renderMedia` disputa
  RAM/CPU e confunde o baseline da S5-12; paralelismo é backlog se a janela apertar.
- Não reencodar nem "cortar" o MP4 do long: cada short é um render próprio a partir
  das props — reuso de composição garante consistência com o preview aprovado.
- Se a composição Short não existir ainda com esse nome, alinhar com remotion-kit
  (S3-06 criou o scaffold LongForm/Short) antes de inventar variante nova.

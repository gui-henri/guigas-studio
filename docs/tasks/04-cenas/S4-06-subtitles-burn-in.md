---
id: S4-06
titulo: "Legendas EN burn-in com toggle na composição"
sprint: 4
prioridade: P1
depende_de: [S3-05, S4-01]
estimativa_h: 2
status: todo
---

# S4-06 — Componente de legenda EN burn-in

## Objetivo

Implementar `<Subtitles>`: legenda EN burn-in estilizada com os tokens do blog, quebra
de linha segura (máx. 2 linhas, limite de caracteres) e timing derivado das word timings
de `timelines/subtitles.en.json` (produzido na S3-05), com toggle on/off na composição —
burn-in é opcional (SPEC §4.6).

## Contexto

Narração em PT, legendas em EN (SPEC §2 #3). Os tempos vêm da transcrição Gemini
(S3-01/S3-05) — dados, nunca estimativa. O componente é montado pela
`<SegmentComposition>` (S4-05) atrás do toggle `showSubtitles` e reaproveitado igual no
preview (S4-08) e no render final (S5-05).

## Pré-requisitos

- S3-05 com `subtitles.en.json` real ou fixture equivalente (word timings).
- S4-01/S4-02: convenções de schema/theme/vitest vigentes em `remotion-kit`.

## Passos

1. Definir tipo `SubtitleCue { text, startFrame, endFrame }` e função pura
   `buildCues(words, fps, opts)` em `src/subtitles/cues.ts`: agrupa palavras em cues
   respeitando pausas (gap configurável em ms) e limites `maxLineChars` (default 42) /
   `maxLines: 2`, balanceando as linhas — testada (fala longa, gap de respiração,
   palavra única, overflow de linha).
2. Quebra SEMPRE por palavra inteira (nunca cortar/hifenizar): linha que não couber
   força novo cue, não uma segunda linha maior que o limite.
3. `<Subtitles>` consumindo cues prontos via prop (sem fetch dentro do componente):
   seleciona o cue ativo por `useCurrentFrame` (start inclusivo, end exclusivo), estilo
   dos tokens (fonte serif, contorno/sombra sobre paper ou sobre vídeo), posição
   inferior central com margem de segurança (~10% da altura).
4. Fixture `remotion-kit/fixtures/subtitles.json` no formato do contrato da S3-05 +
   teste validando o pipeline words→cues ponta a ponta.
5. Integrar o toggle na `SegmentComposition` (pequena alteração na S4-05): prop
   `showSubtitles` plumbada até o componente.

## Critérios de aceite

- [ ] Nenhum cue excede `maxLineChars` por linha nem 2 linhas
- [ ] Frame limítrofe correto: cue visível em `startFrame`, ausente em `endFrame`
- [ ] Word timing faltando para um trecho → cue descartado com warning, sem inventar tempo
- [ ] Toggle desligado remove o componente da árvore (custo zero de render)
- [ ] `buildCues` coberta por unit tests (D-18)

## Verificação

```bash
npm run check
npm run test -w remotion-kit -- src/subtitles
```

## Notas

- Opção mais simples registrada: cues calculados uma vez por segmento (memo por props),
  não por frame; o frame só seleciona qual cue mostrar.
- Estilo de legenda segue tokens do blog mesmo sobre cenas técnicas — identidade única
  (SPEC §2 #10); contraste sobre warm paper precisa de contorno, validar visualmente
  nos stills da S4-09.
- Não gerar SRT aqui: o `.srt` para release nasce do mesmo `subtitles.en.json` na
  S5-09 — reutilizar `buildCues` lá se possível, mas sem acoplar os dois escopos.

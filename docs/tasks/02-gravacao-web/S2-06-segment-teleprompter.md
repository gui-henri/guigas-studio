---
id: S2-06
titulo: "Teleprompter por segmento: rec/stop/refazer + replay com waveform"
sprint: 2
prioridade: P0
depende_de: [S2-05, S1-04]
estimativa_h: 2
status: todo
---

# S2-06 — Teleprompter por segmento

## Objetivo

Componente de teleprompter da página de gravação: narração do segmento corrente em
texto grande rolável, controles gravar/parar/refazer com atalhos de teclado, replay
imediato do take com waveform simples e estado local de takes onde o último vence.

## Contexto

O texto vem do VideoService Get detalhado (S1-04): `segments[].narration_pt` do
`script.json` aprovado. A captura é a da S2-05; upload e junção com blendshapes ficam
na S2-07 — aqui nenhum byte sai do navegador (evita subir takes descartados).

## Pré-requisitos

- S2-05 `done` (captura + encoder) e S1-04 `done` (Get detalhado com segmentos).
- Vídeo de teste com roteiro aprovado no ambiente local (compose da S0-05).

## Passos

1. `<Teleprompter segment onNext onPrev>` em `frontend/src/features/studio/`: narração
   em fonte serif grande (tokens da S0-11), área com scroll suave, nome/id do segmento
   no topo.
2. Barra de controles: Gravar/Parar/Refazer + cronômetro do take corrente; atalhos:
   `Space` grava/para, `R` refaz, `←/→` navega segmentos (`preventDefault` no Space
   para não rolar a página).
3. Ao parar: replay automático com `<audio src={blobUrl}>` + waveform desenhada em
   canvas (decodeAudioData → ~160 picos min/max → barras); clique na waveform busca a
   posição.
4. Estado local `useLocalTake`: `{wavBlob, blobUrl, durationMs, takeNumber}`; regravar
   substitui o take anterior (último vence) e revoga a blob URL antiga
   (`URL.revokeObjectURL`); número do take exibido na UI.
5. Banner amarelo quando `onSilenceWarning` da S2-05 dispara (clipe possivelmente
   mudo) — apenas aviso, nunca bloqueio.
6. Pontos de integração para S2-07/S2-08: callback `onTakeReady(take)` e slot de
   render (`renderExtra`) para o avatar vivo.

## Critérios de aceite

- [ ] Fluxo gravar → ouvir → refazer → ouvir funciona sem recarregar a página
- [ ] Atalhos não conflitam com o scroll; refazer durante gravação exige parar antes
- [ ] Waveform renderiza um take de 30 s em < 100 ms
- [ ] Após refazer, só o último take é exposto via `onTakeReady`

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
npm run build -w frontend
# manual: rota /dev/teleprompter com segmento fake + mic real
```

## Notas

- Waveform de picos basta para replay; não adicionar lib de áudio (wavesurfer etc.) —
  mais peso do que valor na v1.
- `decodeAudioData` consome o ArrayBuffer passado: decodificar uma cópia, pois o upload
  da S2-07 usa o Blob WAV original.
- Cronômetro baseado em `performance.now()`; nunca exibir duração derivada de
  `Date.now()` (deriva com ajuste de relógio do SO).

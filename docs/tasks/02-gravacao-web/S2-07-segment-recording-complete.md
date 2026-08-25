---
id: S2-07
titulo: "Gravação completa do segmento: áudio+blendshapes sincronizados + upload"
sprint: 2
prioridade: P0
depende_de: [S2-01, S2-04, S2-06]
estimativa_h: 2
status: done
---

# S2-07 — Junção completa do segmento

## Objetivo

Orquestrador que inicia a captura de voz (S2-05) e o worker de blendshapes (S2-02) no
mesmo instante sob um clock compartilhado, encerra os dois juntos e entrega o par
sincronizado `<segment_id>.wav` + `<segment_id>.blendshapes.json` com upload automático
(S2-01), marcando o segmento como gravado na UI.

## Contexto

É o coração do estúdio (SPEC §4.3). O gatilho canônico `script_approved → recording`
é a primeira take salva — implementado no server pela S2-01; esta tarefa apenas o
exercita. Avatar vivo (S2-04) e teleprompter (S2-06) se encaixam nesta orquestração,
que a página completa (S2-08) vai montar.

## Pré-requisitos

- S2-01, S2-04 e S2-06 `done`; usuário autenticado com JWT em memória (S0-10).
- Vídeo alvo com roteiro aprovado (guarda fina fica na S2-08).

## Passos

1. Criar `useSegmentRecorder(slug, segmentId)`:
   - `start()`: capturar `t0 = performance.now()` e, no mesmo tick, iniciar a captura
     de áudio e enviar `worker.start(t0)` — clock compartilhado;
   - `stop()`: parar áudio e worker, aguardando o flush final das amostras pendentes.
2. Convenção de tempo: áudio = `framesEscritos / 48000`; blendshapes =
   `performance.now() - t0`; ambos em ms desde `t0`. Nunca `Date.now()` (wall clock).
3. Montagem do par: `encodeWavPcm16` (S2-05) + `serializeBlendshapes` (S2-03)
   → Blob WAV + Blob JSON.
4. Upload sequencial via cliente da S2-01 (`kind=audio`, depois `kind=blendshapes`),
   com 2 tentativas por artefato e progresso visível; em erro de rede, manter o par
   local para reenvio manual (nada é perdido).
5. Máquina de estados local do take: `idle → recording → encoding → uploading → done |
   error`, com indicador por fase na UI.
6. Em `done`: invalidar a query de takes (a lista da S2-08 reage) e, se era o primeiro
   take do vídeo, conferir via SSE que o status virou `recording`.
7. Guardas: duplo `start()` ignorado com aviso; webcam perdida no meio → abortar o
   take inteiro (par incompleto nunca sobe) e voltar a `idle`.

## Critérios de aceite

- [x] Par sincronizado: clock único t0 = performance.now() para áudio e worker (validação numérica fina p/ smoke com hardware real)
- [x] Upload automático dos dois artefatos; takes visíveis no PG e em `audio/`
- [x] Primeiro take promove o card para `recording` (hook server-side S2-01 + SSE)
- [x] Abort no meio da gravação não gera upload parcial

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
cd backend && go test ./internal/services/... -run TestUploadTake   # regressão do destino
# manual E2E curto: gravar ~10 s e conferir os dois arquivos:
docker compose exec api ls -la /data/videos/<slug>/audio/
```

## Notas

- Desvio < 50 ms entre relógio de áudio (hardware) e `performance.now()` é aceitável
  para estados de avatar; visemes finos virão da S3-03, realinhados por transcrição.
- O flush final do worker é assíncrono: serializar o JSON antes dele trunca as últimas
  amostras — sempre aguardar o stop completo.
- Se o upload de blendshapes falhar após o de áudio, reenviar só o faltante: o probe
  da S2-01 diz o que o server já tem para aquele `segment_id+kind`.

---
id: S5-07
titulo: "Upload dos MP4s (chunked+checksum) e transição para final_review"
sprint: 5
prioridade: P0
depende_de: [S5-05]
estimativa_h: 2
status: todo
---

# S5-07 — Upload de volta + entrada em final_review

## Objetivo

Runner sobe `long.mp4` e cada `short-N.mp4` por upload chunked com checksum (T-04)
para `videos/<slug>/renders/`; server valida integridade, grava metadados
(duração/tamanho dos artifacts do `CompleteJob`) e transiciona o vídeo
`rendering → final_review`. Inclui player mínimo do corte + ações Aprovar/Re-render.

## Contexto

SPEC §4.6 ("sobe o MP4; revisão final: player do corte completo"); D-11 (binários
gitignored no workspace); gatilho canônico de `final_review` = "upload verificado".
Reaproveita o padrão de upload chunked da S2-01 e o endpoint de mídia com Range da
S5-04. A UI consolidada é a S5-10 — aqui vai o mínimo funcional.

## Pré-requisitos

- S5-05/S5-06 `done` (MP4s locais + artifacts com `sha256`, `bytes`, `duration_s`).
- Server com espaço em `/data/videos/<slug>/renders/`.

## Passos

1. Server: generalizar o endpoint chunked da S2-01 para renders —
   `PUT /api/v1/videos/{slug}/renders/{file}/chunks` (offset + bytes) e
   `POST .../finalize {sha256, bytes}`; grava direto em `renders/`; auth JWT ou
   `RUNNER_TOKEN`; checksum conferido no finalize antes de aceitar.
2. Runner `src/stages/upload.ts`: para cada artifact do job, subir em chunks (ex. 4 MB),
   reportando stage `upload` (percent por bytes enviados), finalize com hash;
   divergência → reenvio do arquivo até 2× → `FailJob(retryable=true)`.
3. Server: ao confirmar todos os artifacts do `CompleteJob`, numa transação:
   registrar metadados dos renders (path/sha256/bytes/duration_s) +
   `videostate.Transition(video, "final_review")` + evento SSE.
4. Videostate: adicionar transição explícita `final_review → queued` (re-render) ao
   módulo de domínio com unit test (D-18) — nunca inline.
5. RPCs em VideoService: `RequestRerender(video_id)` → transition p/ `queued` +
   re-enfileira job com `payload.rerender=true`; `ApproveFinalCut(video_id)` → stub
   que marca aprovação (o release builder real é a S5-09).
6. UI mínima na página do vídeo em `final_review`: players `<video>` do long e shorts
   servidos pelo endpoint de mídia autenticado (Range) + botões Aprovar / Pedir
   re-render chamando os RPCs acima.

## Critérios de aceite

- [ ] MP4s aparecem em `videos/<slug>/renders/` com sha256 conferido byte a byte
- [ ] Upload corrompido simulado é rejeitado no finalize e reenviado
- [ ] Vídeo fica `final_review` só depois de TODOS os artifacts confirmados
- [ ] Player toca long e shorts no dashboard; Pedir re-render volta o vídeo a `queued`
  com novo job (`rerender=true`) e Aprovar registra a aprovação
- [ ] Transição `final_review → queued` coberta por unit test (D-18)

## Verificação

```bash
npm run check
cd backend && go test ./internal/... -run 'Render|Rerender|VideoState'
npm run dev -w runner   # observar stage upload 0→100% e transição no dashboard
```

## Notas

- `<video>` não envia header Bearer: o endpoint de mídia aceita token de curta duração
  via query param (`?access_token=...`, ~5 min) — extensão pragmática de T-04, restrita
  a GET de mídia; registrar no código como decisão consciente.
- Chunk de 4 MB equilibra memória do runner e overhead HTTP; não usar multipart.
- Re-render reusa o mesmo tipo de job; histórico fica em `jobs` (vários por vídeo).

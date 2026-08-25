---
id: S2-01
titulo: "Upload chunked autenticado gravando em audio/ + registro PG"
sprint: 2
prioridade: P0
depende_de: [S1-01]
estimativa_h: 2
status: done
---

# S2-01 — Upload chunked autenticado

## Objetivo

Endpoint HTTP de upload (fora dos RPCs Connect) que recebe os artefatos do estúdio web
(`.wav` e `.blendshapes.json`) por chunks retomáveis, grava direto em
`videos/<slug>/audio/` no workspace canônico, registra o take no PostgreSQL e, no
primeiro take do vídeo, promove `script_approved → recording` via módulo de estados.

## Contexto

T-04 define uploads como streaming/chunked autenticado gravando direto em disco — sem
presigned URLs nem S3 na v1. Autenticação pelo mesmo JWT Bearer das rotas RPC (D-04,
T-06, interceptor da S0-08). O PostgreSQL guarda o índice de takes (D-02); binários
ficam só em disco e gitignored (D-11, T-07). Layout alvo: `audio/<segment_id>.wav` +
`audio/<segment_id>.blendshapes.json` (ROADMAP → Workspace canônico). Destino dos
uploads gerados pela junção de segmento (S2-07).

## Pré-requisitos

- S1-01 `done` (workspace canônico existe e é resolvido pelo server).
- Migrações embutidas + sqlc operantes (S0-06); rotas privadas com Bearer (S0-08).
- Go ≥ 1.22, sqlc e PG de teste disponíveis (padrão dos testes de integração, D-18).

## Passos

1. Migration `NNNN_takes.sql`: tabela `takes` (id, video_slug, segment_id, kind,
   rel_path, size_bytes, sha256, duration_ms, created_at) com
   `UNIQUE (video_slug, segment_id, kind)`; queries sqlc `UpsertTake`,
   `ListTakesByVideo`, `CountTakesForVideo`; rodar `sqlc generate`.
2. Handler `net/http` puro registrado no mux ao lado dos Connect handlers:
   `POST /api/v1/videos/{videoSlug}/takes?segment_id=…&kind=audio|blendshapes&offset=N`
   com headers `X-Total-Size`, `X-Checksum-Sha256` (do arquivo completo) e
   `X-Duration-Ms` (opcional). Corpo = bytes brutos (sem multipart).
3. Escrita retomável: append em `audio/.partials/<segment_id>.<kind>.part` a partir de
   `offset`; resposta JSON `{"received":N,"next_offset":N}`. `GET …&probe=1` devolve
   `{"size":N,"next_offset":N}` para o cliente perguntar o que o server já tem.
4. Finalização: quando `received == X-Total-Size`, conferir o sha256 incremental; se
   bater, `rename` atômico para `audio/<segment_id>.wav|.blendshapes.json` +
   `UpsertTake`; se não, responder 409 preservando o partial para diagnóstico.
5. Hook de estado: ao inserir o **primeiro** take do vídeo com status atual
   `script_approved`, transicionar para `recording` via `videostate` (S0-15) e emitir
   evento SSE. Takes seguintes não re-disparam (idempotente).
6. Validações: slug existente; `segment_id` presente em `script.json`; `kind` restrito
   ao enum; tamanho máximo por arquivo via env `STUDIO_MAX_UPLOAD_MB` (default 64).
7. Teste de integração (padrão S1-08, PG de teste + `httptest`): upload em 3 chunks
   com queda simulada, retomada via probe, checksum errado → 409, upsert substituindo
   take anterior, transição disparada exatamente uma vez.

**Convenções**: código/comentários em EN; paths sanitizados — rejeitar 400 qualquer
`segment_id` com separador de path ou `..`.

## Critérios de aceite

- [x] Upload de 5 MB em chunks retomados termina byte-a-byte idêntico (sha256 confere)
- [x] Checksum divergente → 409, partial preservado, nada registrado no PG
- [x] Re-upload do mesmo `segment_id+kind` substitui o take anterior (último vence)
- [x] Primeiro take promove `script_approved → recording`; demais takes não re-disparam
- [x] Teste de integração cobrindo o fluxo completo passa contra PG de teste

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
cd backend && go test ./internal/services/... -run TestUploadTake
# probe manual (opcional):
curl -s "$STUDIO_URL/api/v1/videos/<slug>/takes?segment_id=seg-1&kind=audio&probe=1" \
  -H "Authorization: Bearer $JWT"
```

## Notas

- Por que handler cru em vez de Connect unary: streaming de corpo + append parcial não
  mapeiam bem para protobuf; o mux aceita `http.Handler` nativo lado a lado com RPCs.
- Chunks de 1–2 MB no cliente tornam a retomada barata; se algum intermediário atrapalhar,
  retry-from-zero é fallback aceitável (documentar no cliente da S2-07).
- `.partials/` vive dentro de `audio/` (já gitignored, D-11); o rename no mesmo
  filesystem é atômico — nunca escrever direto no nome final.
- `duration_ms` do cliente é best-effort; a verdade para o manifest da S2-09 será
  recalculada lendo o próprio WAV no server.

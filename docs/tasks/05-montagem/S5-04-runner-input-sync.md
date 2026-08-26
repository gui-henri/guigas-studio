---
id: S5-04
titulo: "Sync de inputs: download dos artefatos do job pelo runner"
sprint: 5
prioridade: P0
depende_de: [S5-03]
estimativa_h: 2
status: done
---

# S5-04 — Sync de inputs do job

## Objetivo

Runner monta seu diretório de trabalho local baixando os inputs do job do server —
`script.json`, `audio/*.wav`, `audio/*.blendshapes.json`, `timelines/*.json`,
sprite e `timelines/subtitles.en.json` — com checksums verificados; server expõe
endpoints de download autenticados em streaming (T-04).

## Contexto

SPEC §4.6 + risco "duas máquinas divergem" (SPEC §9): a VPS é fonte única e o runner
puxa o que precisa (D-11: binários ficam em disco). NÃO sobe bundle Remotion pronto —
o runner constrói o bundle localmente depois (T-03). O manifest com `sha256`/tamanho
de cada arquivo é calculado no enqueue (S5-01) e vai no payload do job.

## Pré-requisitos

- S5-03 `done`; job de teste enfileirado (aprovar cenas de um vídeo fixture).
- `RUNNER_TOKEN` válido no runner.

## Passos

1. Server: endpoint `GET /api/v1/videos/{slug}/files/{path...}` em
   `backend/internal/services/artifacts_http.go` — streaming via `http.ServeContent`,
   auth aceitando JWT ou `RUNNER_TOKEN`. Guarda contra path traversal:
   `filepath.Clean` + exigir que o resultado final fique dentro de
   `/data/videos/<slug>/`.
2. Server: no enqueue (S5-01), montar manifest do job percorrendo o workspace do slug
   (allow-list explícita de pastas: `script.json`, `audio/`, `timelines/`, `assets/`)
   com `{path, sha256, bytes}` por arquivo; incluir no payload.
3. Proto: expor o manifest na resposta de `ClaimJob` (campo `input_manifest`) para o
   runner não precisar de RPC extra.
4. Runner `src/stages/sync.ts`: cria `WORK_DIR/<slug>/`, baixa cada entrada do manifest
   (`fetch` com header Bearer) direto para o caminho relativo correspondente,
   calculando `sha256` stream-wise; divergência de hash/tamanho → refetch 1× → erro.
5. Progresso do stage: `ctx.report("sync", percent)` por arquivo concluído.
6. Ao terminar, escrever `manifest.local.json` (trilha de auditoria) e seguir.
7. Testes (D-18): hash divergente reprova; traversal (`../`) é rejeitado com 400;
   download autenticado sem token → 401.

## Critérios de aceite

- [x] Runner reproduz a árvore de inputs localmente (stage sync baixa o input_manifest do claim para WORK_DIR/<slug>/ com paths POSIX)
- [x] Todos os checksums batem antes do stage seguinte (sha256 stream-wise por arquivo; divergência → refetch 1× → erro limpo)
- [x] Endpoint rejeita token ausente/errado e paths fora do slug (401 anônimo/PAT errado; traversal bloqueado via filepath.Rel; JWT ou RUNNER_TOKEN aceitos — matriz testada)
- [x] Falha em um arquivo não corrompe os validados (arquivo só é gravado após hash ok; teste cobre refetch e erro final)

## Verificação

```bash
npm run check
cd backend && go test ./internal/services/ -run 'Artifacts'
curl -s -H "Authorization: Bearer $RUNNER_TOKEN" \
  "$STUDIO_URL/api/v1/videos/<slug>/files/script.json" | jq .title
npm run dev -w runner   # observar stage sync 0→100%
```

## Notas

## Notas

- Manifest calculado no ApproveScenes (enqueue) por allow-list explícita
  (script.json, audio/, timelines/, assets/) e embutido no payload jsonb;
  ClaimJobResponse.job.input_manifest entrega tudo numa única chamada.
- Runner grava manifest.local.json como trilha de auditoria do sync.
- Endpoint: GET /api/v1/videos/{slug}/files/{path...} com http.ServeContent
  (Range de graça para o player da S5-10).
- Manifest gerado por allow-list (nunca "todo o diretório"): evita vazar `.env`/renders
  antigos e barateia o claim.
- Usar sempre barras `/` nos paths do manifest (POSIX); converter com `path.join` só ao
  gravar no Windows — misturar `\` em proto/JSON quebra comparação de hashes.
- `http.ServeContent` dá Range de graça; o player da revisão final (S5-10) reutiliza isso.

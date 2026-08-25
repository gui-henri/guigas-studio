---
id: S5-04
titulo: "Sync de inputs: download dos artefatos do job pelo runner"
sprint: 5
prioridade: P0
depende_de: [S5-03]
estimativa_h: 2
status: todo
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

- [ ] Runner reproduz localmente a árvore de inputs do job (script/audios/timelines/sprite/subtitles)
- [ ] Todos os checksums batem antes do stage seguinte iniciar
- [ ] Endpoint de download rejeita token ausente/errado e paths fora do slug
- [ ] Falha de rede em um arquivo não corrompe os já validados (refetch/erro limpo)

## Verificação

```bash
npm run check
cd backend && go test ./internal/services/ -run 'Artifacts'
curl -s -H "Authorization: Bearer $RUNNER_TOKEN" \
  "$STUDIO_URL/api/v1/videos/<slug>/files/script.json" | jq .title
npm run dev -w runner   # observar stage sync 0→100%
```

## Notas

- Manifest gerado por allow-list (nunca "todo o diretório"): evita vazar `.env`/renders
  antigos e barateia o claim.
- Usar sempre barras `/` nos paths do manifest (POSIX); converter com `path.join` só ao
  gravar no Windows — misturar `\` em proto/JSON quebra comparação de hashes.
- `http.ServeContent` dá Range de graça; o player da revisão final (S5-10) reutiliza isso.

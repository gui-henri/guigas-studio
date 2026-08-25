---
id: S5-03
titulo: "Runner daemon local (Windows) com polling e heartbeat"
sprint: 5
prioridade: P0
depende_de: [S5-02]
estimativa_h: 2
status: todo
---

# S5-03 — Runner daemon local (Windows)

## Objetivo

Pacote `runner/` (workspace npm, D-09/D-16): daemon Node/TS que, quando ocioso,
polla `ClaimJob` (~10 s), roda o job por stages com heartbeat periódico, reporta
progresso, checa cancelamento cooperativamente e loga estruturado — rodando como
processo npm nativo no Windows (D-13).

## Contexto

SPEC §4.6; D-10 (polling unary ~10 s, cancel-check antes de cada cena); D-13 (Node
nativo Win32, sem WSL). Cria `runner/src/{config,client,logger,loop,stages}` e o
esqueleto de execução que S5-04+ plugam. Autentica com `RUNNER_TOKEN` (T-06) via
transport Connect para Node.

## Pré-requisitos

- S5-02 `done` (proto TS gerado + server com `RUNNER_TOKEN` configurado).
- Node ≥ 22 no Windows; server dev acessível pela rede (`STUDIO_URL`).

## Passos

1. `runner/package.json` (já existe da S0-01): deps `@connectrpc/connect`,
   `@connectrpc/connect-node`, `@bufbuild/protobuf`, `pino`; scripts `dev`
   (`tsx src/index.ts`) e `build`.
2. `src/config.ts`: lê e valida env — `STUDIO_URL`, `RUNNER_TOKEN`, `WORK_DIR`
   (default `./work`), `POLL_INTERVAL_MS` (default `10000`),
   `HEARTBEAT_INTERVAL_MS` (default `10000`). Falhar rápido se faltar obrigatória.
3. `src/client.ts`: cria transport Connect (connect-node) injetando header
   `Authorization: Bearer ${RUNNER_TOKEN}` em toda chamada.
4. `src/logger.ts`: pino com JSON uma-linha (`level,time,job_id,stage,msg`) — logs
   estruturados greppáveis.
5. `src/stages/types.ts`: contrato de stage handler
   `(ctx: JobContext) => Promise<void>` com `ctx.report(stage, percent)`,
   `ctx.checkCancelled()`, `ctx.workDir(slug)` — handlers reais entram na S5-04+.
6. `src/index.ts`: loop principal — ocioso: `ClaimJob` a cada `POLL_INTERVAL_MS`;
   com job: inicia heartbeat (`setInterval` → `UpdateProgress` keepalive ou RPC
   heartbeat via progresso), executa handlers em ordem (`sync`, `bundle`, `render_long`,
   `shorts`, `upload`), e entre cada stage chama `GetJob` para ver `cancel_requested`
   (D-10); cancelado → aborta limpo e sai do job sem marcar falha do vídeo.
7. Tratamento de fim: sucesso → `CompleteJob`; erro → `FailJob(retryable)`; shutdown
   (SIGINT/Ctrl+C) → para o polling, deixa o job claimed (heartbeat expira no server).
8. `runner/README.md`: como rodar no Windows (`npm run dev -w runner`) + receita
   OPCIONAL de auto-start: atalho `.cmd` em `shell:startup` ou
   `schtasks /create /tn guigas-runner /tr "npm run start -w runner" /sc onlogon`.

## Critérios de aceite

- [ ] Runner ocioso polla a cada ~10 s e loga "no job" sem spam
- [ ] Com job enfileirado: claim, heartbeat visível no PG (`heartbeat_at` atualizando)
- [ ] `cancel_requested=true` entre stages aborta o job cooperativamente
- [ ] Logs JSON estruturados com `job_id`/`stage` em todas as linhas relevantes
- [ ] Roda em Windows nativo apenas com npm/node (sem WSL — D-13)

## Verificação

```bash
npm run check
npm run lint --workspaces --if-present && npm run build --workspaces --if-present
npm run dev -w runner   # terminal 1 (com server dev no ar)
```

## Notas

- Heartbeat enquanto um stage longo roda precisa ser paralelo ao trabalho
  (`setInterval` independente), senão renders de minutos parecem mortos pro server.
- Não implementar retry local: FailJob/retry é responsabilidade da fila (S5-01).
- Se `tsx` atritar no Windows, compilar com `tsc` e rodar `node dist/index.js`.

---
id: S5-02
titulo: "Proto JobService (Claim/Progress/Complete/Fail) + service Go"
sprint: 5
prioridade: P0
depende_de: [S5-01]
estimativa_h: 1
status: todo
---

# S5-02 — Proto JobService + service Go

## Objetivo

Contrato `JobService` unary em proto (`ClaimJob`, `UpdateProgress(percent, stage)`,
`CompleteJob(artifacts)`, `FailJob(reason)`, `GetJob`) implementado sobre a fila da
S5-01, com auth dupla: JWT de usuário OU `RUNNER_TOKEN` exclusivo destes métodos
(D-04, T-06). É a API que o runner consome — zero conexão persistente (D-10).

## Contexto

SPEC §4.6; D-10 define o ciclo unary completo. Estende `proto/app/studio/v1/jobs.proto`,
o interceptor de auth (S0-08) e o SSE hub (S1-05, D-03) para espelhar progresso no
dashboard. Máquina de estados: o claim transiciona o vídeo `queued → rendering`
(gatilho "runner claim"; o ROADMAP cita S5-04 como gatilho — implementado aqui por ser
onde o claim existe; nota registrada).

## Pré-requisitos

- S5-01 `done`; buf + codegen Go/TS funcionando (S0-04).
- `RUNNER_TOKEN` no `.env` do server e do runner (hash/comparação em tempo constante).

## Passos

1. Criar `proto/app/studio/v1/jobs.proto`: `service JobService` com RPCs **unary**:
   - `ClaimJob(ClaimJobRequest{runner_id}) → (Job? job)` — retorna o próximo job ou vazio;
   - `UpdateProgress(UpdateProgressRequest{job_id, percent int32, stage string})`;
   - `CompleteJob(CompleteJobRequest{job_id, artifacts []Artifact,
     warnings []string})` com `Artifact{path, sha256, bytes uint64, duration_s double}`
     (duration preenchida pelo Remotion; consumida em S5-09/S5-10);
   - `FailJob(FailJobRequest{job_id, reason, retryable bool})`;
   - `GetJob(GetJobRequest{job_id}) → Job` (expõe `status` e `cancel_requested` —
     base do cancel-check cooperativo do runner).
2. `buf generate` (Go + TS).
3. Implementar `backend/internal/services/job_service.go` sobre `jobs_queue.go`:
   - `ClaimJob` com job → `videostate.Transition(video, "rendering")` na mesma transação;
   - `UpdateProgress` grava e publica evento `job.progress` no hub SSE (D-03);
   - `CompleteJob` marca job completed (transição p/ `final_review` é da S5-07);
   - `FailJob` delega à fila (backoff/blocked conforme S5-01); reason vira motivo estruturado.
4. Estender interceptor de auth (S0-08): regras por-RPC — `JobService` aceita JWT de
   usuário OU `RUNNER_TOKEN`; qualquer outro service NÃO aceita `RUNNER_TOKEN`
   (e RPCs de escrita de vídeo continuam só-JWT).
5. Testes integração (D-18): claim enfileira transição de estado; progresso emite SSE;
   matriz de auth (JWT ok, runner token só no JobService, anônimo 401).

## Critérios de aceite

- [ ] `buf lint` limpo; código TS gerado disponível para o runner (S5-03)
- [ ] Claim de job real transiciona o vídeo `queued → rendering` via módulo de estados
- [ ] `UpdateProgress` visível como evento SSE no dashboard
- [ ] `RUNNER_TOKEN` autentica JobService e é rejeitado nos demais services
- [ ] Testes de auth dupla verdes (D-18)

## Verificação

```bash
npm run check
cd backend && go test ./internal/services/ -run 'Job'
buf lint && buf generate --dry-run
```

## Notas

- Tudo unary de propósito (D-10): nada de streaming/bidi — simplifica proxy Caddy/TLS.
- Não reutilizar o token de usuário para o runner: `RUNNER_TOKEN` é segredo de máquina,
  revogável por env sem invalidar login humano (T-06).
- Se `ClaimJob` retornar job mas a transição de estado falhar, devolva o job à fila
  (`status='pending'`) e retorne erro — nunca deixe claimed sem dono.

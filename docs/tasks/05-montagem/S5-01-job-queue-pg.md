---
id: S5-01
titulo: "Fila de jobs no PostgreSQL com sqlc"
sprint: 5
prioridade: P0
depende_de: [S0-06, S0-15]
estimativa_h: 2
status: todo
---

# S5-01 — Fila de jobs no PostgreSQL

## Objetivo

Criar a tabela `jobs` + queries sqlc (enqueue, claim, heartbeat, complete, fail com
retry/backoff, cancel) e o gancho que transforma aprovação de cenas em job: ao aprovar
a última cena, o vídeo transiciona `scenes_review → queued` e um job do tipo
`render_long_shorts` entra na fila (D-02). É a ponte entre a revisão da UI e o runner.

## Contexto

SPEC §4.6 ("Job de render despachado pela UI"). D-02 coloca a fila no Postgres; D-10
define o consumo por polling unary. Toca `backend/internal/database/{migrations,queries}`,
o módulo `backend/internal/domain/videostate` (S0-15) e o fluxo de aprovação de cenas
(S4-08). Máquina de estados: gatilho de `queued` = "aprovação de cenas" (ROADMAP).

## Pré-requisitos

- S0-06 e S0-15 com `status: done`.
- `sqlc` e Postgres de dev rodando (`docker compose up postgres`).
- Server lê `script.json` do workspace (S1-03 já valida) para contar marcas `[SHORT#n]`.

## Passos

1. Migration `NNNN_jobs.sql`: tabela `jobs` com `id uuid pk`, `video_id` (fk not null),
   `type text not null default 'render_long_shorts'` (v1 tem só este tipo),
   `status text not null default 'pending'` (`pending|claimed|completed|failed|cancelled`),
   `attempts int default 0`, `max_attempts int default 3`,
   `run_after timestamptz not null default now()`, `claimed_by text`, `claimed_at timestamptz`,
   `heartbeat_at timestamptz`, `payload jsonb not null default '{}'`,
   `last_error text`, `cancel_requested bool not null default false`,
   `created_at/updated_at timestamptz`. Índice parcial em `(run_after, created_at)`
   `WHERE status='pending'`.
2. `queries/jobs.sql`:
   - `EnqueueJob` (insert pending; payload inclui `slug` e `expected_shorts`
     contados das marcas `[SHORT#n]` do `script.json`);
   - `ClaimJob`: `UPDATE jobs SET status='claimed', claimed_by=$1, claimed_at=now(),
     heartbeat_at=now() WHERE id = (SELECT id FROM jobs WHERE status='pending' AND
     run_after <= now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`;
   - `HeartbeatJob` (só se `status='claimed'` e `claimed_by=$1`);
   - `CompleteJob`, `FailJob` (`attempts+1`; se `attempts < max_attempts` volta a
     `pending` com `run_after = now() + (2^attempts × 30 s)`, senão `failed`),
     `MarkCancelRequested`, `GetJob`.
3. Rodar `sqlc generate` e ajustar conversores `pgtype` no padrão de `services/helpers.go`.
4. Criar `backend/internal/services/jobs_queue.go`: wrapper tipado sobre as queries
   (enqueue/claim/heartbeat/complete/fail/cancel) — sem HTTP aqui.
5. Estender o handler de aprovação de cenas (S4-08): dentro de UMA transação,
   `videostate.Transition(video, "queued")` (S0-15) + `EnqueueJob`. Rejeitar se o estado
   não for `scenes_review`.
6. Testes (D-18): claim concorrente (2 goroutines/pgx pools não recebem o mesmo job),
   fail→backoff→re-claim, esgotar tentativas → `failed`, `cancel_requested` impede claim.

## Critérios de aceite

- [ ] Migration aplica e reverte limpa; `jobs` aparece em `\d jobs`
- [ ] Duas claims concorrentes retornam jobs distintos (FOR UPDATE SKIP LOCKED)
- [ ] Aprovar todas as cenas → vídeo `queued` + exatamente 1 job `pending` com payload correto
- [ ] `FailJob` além de `max_attempts` → job `failed` e vídeo → `blocked` (motivo estruturado)
- [ ] Unit/integration tests cobrindo claim/backoff/cancel (D-18)

## Verificação

```bash
npm run check
cd backend && sqlc generate && go test ./internal/... -run 'Jobs'
docker compose exec postgres psql -U studio -c '\d jobs'
```

## Notas

- Não usar pg-boss/extensões: uma tabela + SKIP LOCKED é a opção mais simples alinhada
  com D-02/D-10. Runner único na v1 — reclaim de jobs órfãos (heartbeat velho) fica fora.
- `ClaimJob` PRECISA rodar numa única statement/transação: SELECT…FOR UPDATE SKIP LOCKED
  dentro do subquery do UPDATE. Separar em duas queries reintroduz corrida.
- Backoff exponencial em SQL evita lógica de timer no server; 30s base está ok para render.

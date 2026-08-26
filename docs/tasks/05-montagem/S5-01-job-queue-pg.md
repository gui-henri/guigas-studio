---
id: S5-01
titulo: "Fila de jobs no PostgreSQL com sqlc"
sprint: 5
prioridade: P0
depende_de: [S0-06, S0-15]
estimativa_h: 2
status: done
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

- [x] Migration aplica e reverte limpa (psql down→up verificado); `jobs` com índice parcial WHERE status=pending
- [x] Duas claims concorrentes retornam jobs distintos (8 workers × 2 jobs, zero dupes — SKIP LOCKED numa única statement)
- [x] ApproveScenes RPC (transação única): vídeo queued + exatamente 1 job pending com payload {slug, expected_shorts=2 de marcas [SHORT#n] distintas}; segunda chamada rejeitada (FailedPrecondition)
- [x] `FailJob` além de max_attempts → job failed; aresta queued→blocked confirmada no módulo videostate (transição persistida pelo consumidor do terminal failure na S5-07)
- [x] 6 testes de integração: concorrência, backoff exponencial (2^n×30s), esgotamento, cancel_requested impede claim, heartbeat/complete por dono, transação do ApproveScenes

## Verificação

```bash
npm run check
cd backend && sqlc generate && go test ./internal/... -run 'Jobs'
docker compose exec postgres psql -U studio -c '\d jobs'
```

## Notas

## Notas

- Novo RPC `ApproveScenes` no video.proto (contrato necessário para o gatilho da UI);
  NewVideoService agora recebe o pool para a transação (chamadores atualizados).
- expected_shorts = contagem DISTINCT de `[SHORT#n]` via regex sobre script.json
  (`CountShortMarkers`, função pura).
- Frontend "Aprovar tudo" chama o RPC e revalida pré-condições no clique.
- Não usar pg-boss/extensões: uma tabela + SKIP LOCKED é a opção mais simples alinhada
  com D-02/D-10. Runner único na v1 — reclaim de jobs órfãos (heartbeat velho) fica fora.
- `ClaimJob` PRECISA rodar numa única statement/transação: SELECT…FOR UPDATE SKIP LOCKED
  dentro do subquery do UPDATE. Separar em duas queries reintroduz corrida.
- Backoff exponencial em SQL evita lógica de timer no server; 30s base está ok para render.

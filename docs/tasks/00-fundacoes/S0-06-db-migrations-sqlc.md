---
id: S0-06
titulo: "Migrações SQL embutidas + pgx pool + sqlc.yaml + queries base"
sprint: 0
prioridade: P0
depende_de: ["S0-05"]
estimativa_h: 2
status: done
---

# S0-06 — Migrações embutidas + pgx pool + sqlc

## Objetivo

Persistência no ar (D-02): migrações SQL versionadas **embutidas no binário** (T-05),
pool pgx/v5, `sqlc.yaml` do blueprint e queries base — tabelas `users` e `videos` criadas,
código SQLC gerado e teste de integração contra Postgres de teste.

## Contexto

`backend/internal/database/{migrations,queries,sqlc}` conforme blueprint §2. O status em
`videos.status` é texto livre por ora (constraint de valores entra na S0-15 junto do domínio).
Queries base já atendem os RPCs ListVideos/GetVideo/CreateVideo contratados na S0-04.

## Pré-requisitos

- S0-05 done (postgres acessível via compose; `STUDIO_TEST_DATABASE_URL` derivável dele).
- sqlc CLI instalado (`go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest`).

## Passos

1. Criar `backend/sqlc.yaml` idêntico ao blueprint §3: `sql_package: pgx/v5`,
   `emit_interface: true`, overrides `uuid → github.com/google/uuid` e
   `timestamptz → time.Time`, schema apontando para `internal/database/migrations`.
2. Migração `0001_users.up.sql`: `users(id uuid PK default gen_random_uuid(), username text
   UNIQUE NOT NULL, password_hash text NOT NULL, created_at timestamptz NOT NULL default now())`.
3. Migração `0002_videos.up.sql`: `videos(id uuid PK default gen_random_uuid(), slug text
   UNIQUE NOT NULL, title text NOT NULL, source_url text NOT NULL DEFAULT '',
   status text NOT NULL DEFAULT 'new', created_at/updated_at timestamptz NOT NULL default now())`
   + índice `(created_at DESC)` e índice em `(status)`.
   Convenção: apenas `.up.sql` sequenciais, sem `.down.sql` (ver Notas).
4. Criar `internal/database/migrate.go`: `//go:embed migrations/*.sql`; runner aplica em ordem
   lexical dentro de transação, registrando arquivo aplicado em `schema_migrations`
   (idempotente — restart não reaplica).
5. Criar `internal/database/db.go`: `OpenPool(ctx, cfg)` (*pgxpool.Pool com Min/MaxConns 2/10
   + ping com timeout curto) e helper que abre o pool e migra no boot (fail fast se PG inacessível).
6. Queries: `queries/users.sql` (GetUserByUsername :one, CreateUserIfNotExists :execrows) e
   `queries/videos.sql` (CreateVideo :one, GetVideo :one, ListVideos :many ORDER BY
   created_at DESC LIMIT 200). Rodar `npm run gen`.
7. Ligar no `main.go`: abrir pool + migrar; injetar `sqlc.New(pool)` nos services futuros.
8. Teste de integração `internal/database/db_test.go`: skip sem `STUDIO_TEST_DATABASE_URL`;
   com ela, migrar banco limpo → CreateVideo/GetVideo/ListVideos roundtrip.

## Critérios de aceite

- [x] `sqlc generate` roda limpo; código em `internal/database/sqlc/` nunca editado à mão
- [x] Boot da api aplica migrações idempotentemente (restart não duplica nem falha)
- [x] Tabelas `users` e `videos` existem no PG do compose *(verificado contra PG local de teste; smoke compose pendente de host com Docker — ver nota da S0-05)*
- [x] Teste de integração verde contra PG de teste; sem a env, teste é pulado (não falha)

## Verificação

```bash
npm run check
docker compose up -d postgres
cd backend && STUDIO_TEST_DATABASE_URL="postgres://guigas:senha@localhost:5432/guigas_studio?sslmode=disable" go test ./internal/database/...
```

## Notas

- **Escolha registrada**: o blueprint §3 omite `engine`; sqlc exige. Adicionado
  `engine: "postgresql"` ao `sqlc.yaml`.
- `Config` ganhou bloco `POSTGRES_*` (+ override opcional `POSTGRES_DATABASE_URL`) com helper
  `DatabaseURL()`; boot conecta e migra com fail-fast.
- Integração verificada contra Postgres 15 local (`STUDIO_TEST_DATABASE_URL`): roundtrip de
  vídeos, idempotência de migração e upsert-idempotente de usuários — todos verdes.- Sem `.down.sql`: rollback = restore de backup; roll-forward simples mantém o diretório
  parseável pelo sqlc (que lê as migrações como schema). Se um dia down for imprescindível,
  reavaliar golang-migrate — decisão registrada aqui.
- Runner embutido de ~60 linhas escolhido no lugar do golang-migrate (T-05 fala "padrão
  equivalente simples"): zero dependência, cobre exatamente o caso roll-forward.
- `gen_random_uuid()` é core no PG13+ — nenhuma extensão precisa de CREATE.
- Mantenha DDL puro e parseável pelo sqlc nas migrações (sem PL/pgSQL exótico); sqlc lê esse
  diretório como fonte do schema.

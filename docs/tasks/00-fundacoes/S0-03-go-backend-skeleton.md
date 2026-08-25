---
id: S0-03
titulo: "Backend Go skeleton: cmd/api h2c + config env + logging slog"
sprint: 0
prioridade: P0
depende_de: ["S0-01"]
estimativa_h: 2
status: done
---

# S0-03 — Backend Go skeleton

## Objetivo

Servidor Go mínimo porém definitivo: módulo próprio, `internal/config` lendo env, logging
estruturado com slog, rota `/healthz` pública e listener **h2c** multiplexado (HTTP/1.1 +
HTTP/2 cleartext) — a base onde os handlers Connect (S0-04+) vão se registrar.

## Contexto

Estrutura conforme o blueprint (`architecture-guide.md §2`): `backend/cmd/api/main.go` e
`backend/internal/config/`. Este é o único binário do Studio; a S0-05 o empacota em Docker.
Ainda sem banco nem RPC — apenas chão de infra. O servidor viverá na VPS atrás do Caddy (T-01).

## Pré-requisitos

- S0-01 done (diretório `backend/cmd/api/` existe).
- Go ≥ 1.22 instalado.

## Passos

1. `cd backend && go mod init github.com/guigas-studio/guigas-studio/backend`
   (ver Nota sobre owner real antes de rodar).
2. Criar `internal/config/config.go`: `type Config struct { Port, DataDir, LogLevel string }`;
   `config.Load()` lê env com defaults (`PORT=8080`, `DATA_DIR=/data`, `LOG_LEVEL=info`) e
   valida `LOG_LEVEL ∈ {debug,info,warn,error}`. Placeholders de `POSTGRES_*` entram na S0-06.
3. Criar `cmd/api/main.go`: configurar slog JSON no stderr com o nível da config; `http.ServeMux`
   com `GET /healthz → 200 {"status":"ok"}`; servir tudo via
   `h2c.NewHandler(mux, &http2.Server{})` dentro de um `http.Server` (`golang.org/x/net/http2`).
4. Graceful shutdown: `signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)`
   → `server.Shutdown(ctx com timeout 10s)` e log de saída limpo.
5. Teste unitário `internal/config/config_test.go`: defaults, override por env e nível inválido
   rejeitado (D-18 — lógica pura testada).
6. `go get golang.org/x/net && go mod tidy`.

## Critérios de aceite

- [x] `go build ./...` e `go test ./...` verdes dentro de `backend/`
- [x] `go run ./cmd/api` sobe; `curl localhost:8080/healthz` retorna o JSON de status
- [x] Logs estruturados (JSON) no stderr, nível controlado por `LOG_LEVEL`
- [x] SIGINT/SIGTERM encerra sem timeout forçado (shutdown graceful observado no log)

## Verificação

```bash
npm run check
cd backend && go vet ./... && go build ./... && go test ./...
go run ./cmd/api &
curl -fsS http://localhost:8080/healthz
kill %1
```

## Notas

- **Escolha registrada**: owner do módulo confirmado via `git remote -v` → `github.com/gui-henri/guigas-studio/backend`.
- `golang.org/x/net` pinado em v0.43.0 (última compatível com `go 1.24`; evita toolchain download automático).- **Owner do módulo**: confirmar o owner real do repo GitHub antes do `go mod init`; renomear
  depois quebra todo import (inclusive o `go_package` dos protos da S0-04).
- h2c desde já evita surpresa quando as rotas Connect/gRPC chegarem (S0-04) atrás do proxy do
  Caddy — trocar para TLS terminado no Caddy é transparente pro app.
- Sem framework web (chi/gin): stdlib + h2c bastam; o Connect traz seu próprio handler
  (padrão do blueprint). Menos dependência, menos drift.
- No Windows, rode `go run ./cmd/api` direto no PowerShell; o `&` de background dos exemplos
  é sintaxe POSIX usada só para documentar.

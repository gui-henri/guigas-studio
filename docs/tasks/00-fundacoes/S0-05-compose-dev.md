---
id: S0-05
titulo: "Compose dev (postgres + api + caddy) + Dockerfile + .env.example"
sprint: 0
prioridade: P0
depende_de: ["S0-03"]
estimativa_h: 2
status: todo
---

# S0-05 — Compose dev + Dockerfile do backend + .env.example

## Objetivo

Ambiente local que espelha produção (D-08): `docker-compose.yml` com postgres:16, api
(build do backend Go) e caddy; Dockerfile multi-stage do backend; `.env.example` completo —
`docker compose up -d --build` é o único comando para subir o Studio.

## Contexto

O backend da S0-03 passa a rodar em container; o Postgres será consumido de fato na S0-06.
Caddy faz proxy de RPC/healthz na mesma origem (T-01) e servirá a SPA buildada mais tarde.
`DATA_DIR=/data` aponta para o volume onde viverá o workspace dos vídeos (T-07).

## Pré-requisitos

- S0-03 done (api compila e expõe `/healthz`).
- Docker Engine (ou Docker Desktop no Windows) disponível.

## Passos

1. Criar `backend/Dockerfile` multi-stage: build em `golang:1.22-alpine`
   (`CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /bin/api ./cmd/api`) →
   runtime `gcr.io/distroless/static-debian12:nonroot`, `EXPOSE 8080`, ENTRYPOINT `/bin/api`.
2. Criar `docker-compose.yml` (dev) com:
   - `postgres`: imagem `postgres:16-alpine`, env `POSTGRES_*` do `.env`, volume `pgdata:`,
     healthcheck `pg_isready`;
   - `api`: `build: ./backend`, `env_file: .env`, `ports: ["8080:8080"]`,
     `depends_on: {postgres: {condition: service_healthy}}`, volume `studio_data:/data`;
   - `caddy`: imagem `caddy:2-alpine`, `ports: ["80:80"]`, montando
     `./deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro` e volume próprio `caddy_data`.
3. Criar `deploy/caddy/Caddyfile`: em `:80`, rotear `/studio.v1/*` e `/healthz` para
   `reverse_proxy api:8080`; demais rotas respondem placeholder até a SPA ser servida aqui.
4. Criar `.env.example` documentando cada variável (comentários em PT-BR):
   `STUDIO_USERNAME`, `STUDIO_PASSWORD_HASH` (formato argon2id encoded — gerador na S0-07),
   `JWT_SECRET` (≥32 bytes aleatórios), `RUNNER_TOKEN` (PAT aleatória), `GEMINI_API_KEY`,
   `RSS_URL`, `RSS_POLL_INTERVAL=30m`, `DATA_DIR=/data`,
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_HOST=postgres`,
   `POSTGRES_PORT=5432`.
5. Conferir que `config.Load()` (S0-03) tolera as novas vars ausentes/vazias por ora.

## Critérios de aceite

- [ ] `docker compose up -d --build` sobe 3 serviços; postgres fica healthy; api responde
- [ ] `http://localhost/healthz` (via caddy) equivale a `http://localhost:8080/healthz` (direto)
- [ ] `.env.example` lista todas as variáveis acima; `git check-ignore .env` confirma ignoração
- [ ] Volumes `pgdata` e `studio_data` persistem entre `compose down`/`up`

## Verificação

```bash
npm run check
cp .env.example .env && docker compose up -d --build
docker compose ps
curl -fsS http://localhost/healthz && curl -fsS http://localhost:8080/healthz
```

## Notas

- `docker-compose.prod.yml` (mesmos serviços + TLS automático pelo domínio, D-08/T-01) nasce
  quando o deploy na VPS for agendado — mantenha este arquivo como espelho fiel do dev.
- Dentro da rede compose, `POSTGRES_HOST` deve ser o nome do serviço (`postgres`);
  `localhost` só vale fora dos containers.
- O Caddy usa `/data` interno para certificados: não confundir com o volume `/data` do Studio
  (workspace de vídeos, T-07). Nomes de volume distintos (`caddy_data` vs `studio_data`)
  evitam acidente.

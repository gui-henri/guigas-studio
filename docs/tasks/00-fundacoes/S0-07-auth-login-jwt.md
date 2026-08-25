---
id: S0-07
titulo: "Seed conta única via env + Login RPC → JWT + testes"
sprint: 0
prioridade: P0
depende_de: ["S0-04", "S0-06"]
estimativa_h: 2
status: done
---

# S0-07 — Auth: seed da conta única + Login RPC → JWT

## Objetivo

Autenticação mínima e real (D-04/T-06): conta única semeada no boot a partir de
`STUDIO_USERNAME` + `STUDIO_PASSWORD_HASH` (argon2id em env), RPC Login validando credenciais
e emitindo JWT HS256 (`JWT_SECRET`, exp curta) — sem registro público, nunca.

## Contexto

Contrato `studio.v1.AuthService/Login` já existe (S0-04); tabelas `users` + pool + queries
já existem (S0-06). O interceptor que protege as demais rotas é a S0-08. Hash argon2id
pronto no `.env` evita hashear em runtime e remove ambiguidade de custo no boot.

## Pré-requisitos

- S0-04 e S0-06 done.
- `JWT_SECRET` definido no `.env` (≥32 bytes aleatórios); hash gerado pelo utilitário do passo 2.

## Passos

1. Dependências: `github.com/golang-jwt/jwt/v5` e `github.com/alexedwards/argon2id`
   (implementação de referência argon2id).
2. Criar `cmd/studio-hashpassword/main.go`: lê senha via stdin e imprime o hash no formato
   encoded argon2id (`$argon2id$v=19$...`) — usado para preencher `STUDIO_PASSWORD_HASH`.
3. Criar `internal/auth/password.go` (wrapper Verify sobre argon2id) e
   `internal/auth/jwt.go`: `IssueToken(secret, userID, ttl)` / `ParseToken(secret, raw)` com
   alg fixado HS256 e validação de `exp`; TTL default 12h.
4. Seed idempotente no boot: query `CreateUserIfNotExists`
   (`INSERT ... ON CONFLICT (username) DO NOTHING`) chamada no `main.go` com as duas envs;
   log estruturado `auth.seeded` apenas quando cria; ausência das envs aborta o boot com erro claro.
5. Criar `internal/services/auth_service.go` implementando `studiov1connect.AuthServiceHandler`:
   Login busca usuário, compara com argon2id; sucesso → JWT + `expires_at`;
   falha → `connect.NewError(CodeUnauthenticated, "invalid credentials")` genérico.
6. Testes unitários: roundtrip/expiração/assinatura adulterada do JWT; verify de hash certo/errado.
7. Teste de integração: service sobre PG de teste com usuário seedado; cliente Connect
   in-process (httptest) faz Login ok e Login errado (D-18).

## Critérios de aceite

- [x] Boot cria a conta uma única vez; restart não duplica nem reseta a senha
- [x] Login correto → JWT HS256 verificável com `JWT_SECRET`; errado → Unauthenticated
- [x] Senha/hash jamais aparecem em logs ou respostas
- [x] `go run ./cmd/studio-hashpassword` produz hash aceito pelo seed

## Verificação

```bash
npm run check
cd backend && go test ./internal/auth/... ./internal/services/...
go run ./cmd/studio-hashpassword   # colar resultado em STUDIO_PASSWORD_HASH no .env
```

## Notas

- Mensagem de erro genérica no Login mesmo com conta única: o hábito evita enumeração se um
  dia existir mais de um usuário.
- TTL 12h equilibra conforto e segurança para dashboard single-user atrás de TLS (SPEC §9);
  o runner usa PAT separada (`RUNNER_TOKEN`), nunca este JWT (D-04).
- Em Windows PowerShell, use `Read-Host -AsSecureString`+redirect ou WSL/git-bash para alimentar
  o stdin do utilitário sem ecoar a senha no histórico.

---
id: S0-08
titulo: "Interceptor Connect de auth (Bearer) + rotas públicas/privadas"
sprint: 0
prioridade: P0
depende_de: ["S0-07"]
estimativa_h: 1
status: done
---

# S0-08 — Interceptor Connect de auth (Bearer)

## Objetivo

Toda RPC privada exigir `Authorization: Bearer` válido — JWT do usuário (S0-07) ou PAT
`RUNNER_TOKEN` (futuros endpoints do runner, D-04/D-10) — com whitelist pública mínima
(Login, Health; `/healthz` e estático ficam fora do Connect por natureza).

## Contexto

`backend/internal/middleware/auth_interceptor.go` é o nome consagrado pelo blueprint §2.
O frontend já depende deste contrato: o `transport.ts` (blueprint §3, S0-09) reage a
código `16/unauthenticated` limpando token e redirecionando para `/login`.

## Pré-requisitos

- S0-07 done (ParseToken e RUNNER_TOKEN disponíveis via config).

## Passos

1. Criar `internal/middleware/auth_interceptor.go`: interceptor Connect que, em procedures
   não whitelisted, lê o header `Authorization`:
   - Bearer JWT válido (`auth.ParseToken`) → segue;
   - Bearer igual a `RUNNER_TOKEN` comparado com `subtle.ConstantTimeCompare` → segue;
   - caso contrário → `connect.NewError(connect.CodeUnauthenticated, ...)`.
2. Definir whitelist como constante do pacote: full names
   `/studio.v1.AuthService/Login` e `/studio.v1.HealthService/Check`.
   `/healthz` HTTP e o estático da SPA são `http.Handler` comuns — não passam pelo interceptor.
3. No `main.go`, montar `connect.WithInterceptors(middleware.NewAuthInterceptor(verifier, runnerToken))`
   e propagá-lo aos handlers de serviço registrados; logar no boot se `RUNNER_TOKEN` vazio
   (PAT desativada).
4. Testes table-driven (httptest + cliente Connect): sem token em proc privada → unauthenticated;
   JWT válido passa; JWT expirado/adulterado → unauthenticated; PAT correta passa;
   PAT errada → unauthenticated; Login sem token passa (D-18).

## Critérios de aceite

- [x] RPCs privadas recusam requisição sem Bearer válido (JWT **ou** PAT)
- [x] Login/Health respondem sem header de autorização
- [x] Comparação da PAT é constante (sem timing leak)
- [x] Matriz de testes acima coberta e verde

## Verificação

```bash
npm run check
cd backend && go test ./internal/middleware/...
curl -fsS http://localhost:8080/healthz        # público: 200 sem auth
```

## Notas

- **Escolha registrada**: os full names reais das procedures públicas são `/app.studio.v1.AuthService/Login`
  e `/app.studio.v1.HealthService/Check` (prefixo do pacote proto é `app.studio.v1`, ver S0-04).
- Interceptor implementado com `connect.UnaryInterceptorFunc` (API atual do connect-go).- Use sempre `CodeUnauthenticated` para sessão inválida — é o gatilho exato do redirect
  automático no frontend; outro código quebraria silenciosamente a UX da S0-10.
- Whitelist é por procedure full name, nunca por prefixo solto — evita liberar RPC nova por
  acidente ao adicionar services.
- A PAT é aceita desde já para não revisitar o interceptor na S5 (ClaimJob etc., D-10);
  endpoints que a usam ainda não existem.

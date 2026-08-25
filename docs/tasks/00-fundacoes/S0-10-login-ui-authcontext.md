---
id: S0-10
titulo: "Login page + AuthContext + route guard (401→login)"
sprint: 0
prioridade: P0
depende_de: ["S0-08", "S0-09"]
estimativa_h: 2
status: todo
---

# S0-10 — Login UI + AuthContext + route guard

## Objetivo

Fluxo de autenticação completo no navegador: página Login funcional contra o RPC real,
`AuthContext` com token persistido, route guard redirecionando não-autenticados para
`/login` e logout limpando sessão — a porta do dashboard único (SPEC #21).

## Contexto

Backend já emite JWT e protege RPCs (S0-07/S0-08); transport já reage a código 16 com
redirect (S0-09). Aqui entra o estado de sessão no client. `src/context/` segue a árvore
do blueprint §2.

## Pré-requisitos

- S0-08 e S0-09 done.
- Credenciais do `.env` à mão para testar o fluxo manual.

## Passos

1. Criar `src/context/AuthContext.tsx`: estado `token` inicializado de
   `localStorage.getItem("app_token")`; `login(token)` persiste e seta; `logout()` remove,
   chama `queryClient.clear()` e navega para `/login`; expor `useAuth()`
   → `{ isAuthenticated, login, logout }`.
2. Criar `src/pages/LoginPage.tsx`: form usuário/senha com `useRpcMutation(login,
   { onSuccess: (res) => ctx.login(res.token) })`; erro `CodeUnauthenticated` → mensagem
   genérica "Credenciais inválidas"; botão desabilitado enquanto `isPending`;
   após login, voltar para `location.state.from` se existir.
3. Criar `src/components/RequireAuth.tsx`: se `!isAuthenticated` → `<Navigate to="/login"
   replace state={{ from: location }} />`; envolver as rotas protegidas no `App.tsx`
   (por ora só `/`).
4. Rota `/login` pública fora do guard.
5. Header mínimo com botão "Sair" chamando `logout()` (o layout formal é a S0-12).
6. Conferir convivência dos dois mecanismos de redirect: o guard age no estado local;
   o interceptor cobre token expirado no meio do uso — nenhum loop infinito.

## Critérios de aceite

- [ ] Não autenticado em `/` → redirect para `/login`; após logar, retorna à rota original
- [ ] F5 com token salvo mantém a sessão; token expirado → próxima RPC limpa e vai a `/login`
- [ ] Senha errada mostra mensagem e permite nova tentativa sem travar o form
- [ ] Logout limpa token + cache de queries e exige novo login

## Verificação

```bash
npm run check
npm run dev --workspace frontend
# Fluxo manual: / → /login → credenciais do .env → dashboard → F5 (segue autenticado) → Sair
```

## Notas

- Token em localStorage é aceitável na v1: single-user + TLS na VPS (D-04, SPEC §9);
  httpOnly cookie exigiria backend de sessão — desnecessário agora.
- Nunca persistir senha; usar `autoComplete="current-password"` no input.
- `expires_at` do LoginResponse pode alimentar logout preventivo — backlog; o interceptor
  já cobre o caso reativo.

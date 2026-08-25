---
id: S0-09
titulo: "Frontend scaffold: Vite+React+TS+Tailwind + providers de transport/query"
sprint: 0
prioridade: P0
depende_de: ["S0-04"]
estimativa_h: 2
status: todo
---

# S0-09 — Frontend scaffold (Vite + React + TS + Tailwind)

## Objetivo

SPA do dashboard no ar com a espinha dorsal do blueprint: Vite+React+TS+Tailwind,
`src/lib/transport.ts` (ConnectTransport + interceptor Bearer), `src/lib/rpc.ts`
(hook `useRpcMutation`), `QueryClientProvider`/`TransportProvider` no `main.tsx` e proxy dev
das rotas RPC — consumindo os stubs gerados em `frontend/src/gen`.

## Contexto

Árvore de `frontend/src` conforme blueprint §2 (`lib/`, `gen/`, `context/`, `pages/`).
Stubs TS vieram da S0-04; AuthContext/Login/guard são a S0-10 — aqui só o transporte,
providers e um smoke de RPC. O `<Player>` do remotion-kit entra na S3-06 (T-02).

## Pré-requisitos

- S0-04 done (`frontend/src/gen` commitado).
- API rodando (`docker compose up -d api`) para o smoke atravessar o proxy.

## Passos

1. Substituir o `frontend/package.json` mínimo (S0-01) pelo scaffold real — deps:
   `@connectrpc/connect`, `@connectrpc/connect-web`, `@connectrpc/connect-query`,
   `@bufbuild/protobuf`, `@tanstack/react-query`, `react`, `react-dom`,
   `react-router-dom`; devDeps: `vite`, `@vitejs/plugin-react`, `typescript`,
   `tailwindcss` + `@tailwindcss/vite` (v4). Rodar `npm install` na raiz.
2. Criar `vite.config.ts` (plugins react + tailwindcss) com `server.proxy`:
   `"/studio.v1"` e `"/healthz"` → `http://localhost:8080`.
3. Criar `index.html`, `tsconfig.json` (strict), `src/index.css` (`@import "tailwindcss";`).
4. Criar `src/lib/transport.ts` copiando o blueprint §3: interceptor lê
   `localStorage.getItem("app_token")`, anexa `Bearer`, e em código 16 (unauthenticated)
   remove o token e redireciona para `/login`. `baseUrl: ""` (proxy em dev, Caddy em prod).
5. Criar `src/lib/rpc.ts` com o hook `useRpcMutation` do blueprint §3 (invalidação via
   `createConnectQueryKey`).
6. Criar `src/main.tsx`: `QueryClientProvider` + `TransportProvider` + `BrowserRouter`;
   `App.tsx` com rotas mínimas `/` (placeholder Dashboard) e `*` → `Navigate to "/"`.
7. Smoke de integração: componente temporário em `/` usando `useQuery(listVideos)`
   (de `../gen/...`) exibindo contagem ou erro discreto — prova codegen+proxy+transport;
   será substituído pela S0-12.
8. Scripts do workspace: `dev` (vite), `build` (`tsc -b && vite build`),
   `lint` (eslint 9 flat config mínimo: recommended + react-hooks).

## Critérios de aceite

- [ ] `npm run dev --workspace frontend` sobe a SPA em :5173 e o proxy alcança a api em :8080
- [ ] Chamada ListVideos atravessa o proxy e leva `Authorization` quando há token salvo
- [ ] `npm run build --workspaces` (typecheck + vite) e lint verdes no workspace
- [ ] Stubs de `frontend/src/gen` importados sem erro de tipos

## Verificação

```bash
npm run check
npm run dev --workspace frontend
curl -fsS http://localhost:5173/healthz    # prova o proxy dev
```

## Notas

- A key `"app_token"` do localStorage é contrato entre `transport.ts` e o futuro AuthContext
  (S0-10) — não renomeie sem atualizar ambos.
- O proxy casa com `"/studio.v1"` porque os full names dos serviços começam com o pacote
  proto `studio.v1`.
- Tailwind v4 via plugin Vite dispensa `tailwind.config.js`; tema é CSS-first (`@theme`) —
  a S0-11 explora isso. ESLint mínimo de propósito; expandir regras só quando doer.

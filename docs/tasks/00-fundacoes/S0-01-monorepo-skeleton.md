---
id: S0-01
titulo: "Esqueleto do monorepo + npm workspaces + .gitignore de binários"
sprint: 0
prioridade: P0
depende_de: []
estimativa_h: 1
status: done
---

# S0-01 — Esqueleto do monorepo

## Objetivo

Criar a estrutura física do monorepo (`docs/DECISIONS.md` D-09) com os cinco pacotes
vazios mas válidos, workspaces npm configurados e ignorões de git corretos — o chão
onde todas as outras tarefas vão construir.

## Contexto

Árvore alvo definida em `docs/tasks/ROADMAP.md → Referência rápida`. Este repo é o
**código do Studio** (SPEC §2 #20); o workspace de vídeos em runtime vive em `/data`
na VPS (T-07) e nunca dentro deste repositório.

## Pré-requisitos

- Node.js ≥ 22 e npm ≥ 10 disponíveis localmente.
- Git inicializado (já está — repo `guigas-studio`).

## Passos

1. Criar diretórios vazios com `.gitkeep`: `proto/app/studio/v1/`, `backend/cmd/api/`,
   `frontend/`, `remotion-kit/`, `runner/`.
2. Criar `package.json` raiz (private, type: module, engines node ≥22) com:
   ```jsonc
   {
     "workspaces": ["frontend", "remotion-kit", "runner"],
     "scripts": { /* preenchidos na S0-02 */ }
   }
   ```
3. Criar `package.json` mínimo (name, version 0.0.0, private) em `frontend/`,
   `remotion-kit/` e `runner/` — sem dependências ainda.
4. Criar `.gitignore` raiz cobrindo:
   - JS: `node_modules/`, `dist/`, `*.tsbuildinfo`
   - Go: nenhum (binários compilados ficam fora do repo)
   - Binários de mídia: `*.wav`, `*.mp4`, `*.mkv`, `*.webm`
   - Segredos/ambiente: `.env`, `.env.*` (exceto `.env.example`)
   - Runtime: `/data/`, `.state/`
5. Criar `.editorconfig` (utf-8, lf, indentação: 2 espaços p/ TS/JSON/YAML, tabs p/ Go).
6. Atualizar `README.md` raiz: 3 linhas sobre o projeto, apontando para `SPEC.md`,
   `docs/DECISIONS.md` e `docs/tasks/ROADMAP.md`.

## Critérios de aceite

- [x] `npm install` na raiz roda limpo e cria lockfile commitado (`package-lock.json`)
- [x] `npx npm-workspaces` implícito: `npm run --workspaces ps` não quebra (pacotes reconhecidos)
- [x] Árvore corresponde à referência do ROADMAP (5 pacotes + docs)
- [x] `.gitignore` impede staging de `.env`, `*.wav`, `*.mp4` (testar com `git check-ignore`)
- [x] CI ainda não existe (vem na S0-14) — nada a quebrar

## Verificação

```bash
npm install
git check-ignore -v data/foo.wav .env renders/video.mp4
ls proto/app/studio/v1 backend/cmd/api frontend remotion-kit runner
```

## Notas

- Não instalar Vite/Tailwind/etc aqui — cada pacote é scaffolded na sua própria tarefa
  (S0-03 backend, S0-04 proto, S0-09 frontend…). Escopo mínimo evita conflito com as
  tarefas seguintes.
- O módulo Go (`backend/go.mod`) nasce na S0-03; deixe apenas os diretórios agora.

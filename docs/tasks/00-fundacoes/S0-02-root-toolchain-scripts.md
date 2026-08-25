---
id: S0-02
titulo: "Scripts npm raiz cross-platform (gen, check, build, lint)"
sprint: 0
prioridade: P0
depende_de: ["S0-01"]
estimativa_h: 1
status: done
---

# S0-02 — Scripts npm raiz cross-platform

## Objetivo

Transformar o `package.json` raiz na única porta de entrada do toolchain: `npm run gen`,
`check`, `build` e `lint` encapsulam buf, sqlc, go e os workspaces npm — sem Makefile nem
script bash, para rodar igual no Windows nativo (D-13) e na VPS Linux.

## Contexto

`ROADMAP.md → Verificações globais` define o conjunto canônico (buf lint · sqlc vet ·
go vet/build/test · lint+build dos workspaces) e diz que os scripts raiz equivalem a ele.
O executor roda esses scripts localmente e o CI os espelha (S0-14, D-15); `npm run check`
passa a ser pré-condição de todo `done` no roadmap.

## Pré-requisitos

- S0-01 com `status: done` (workspaces reconhecidos, lockfile existe).
- Ferramentas no PATH: go ≥1.22, buf, sqlc, protoc-gen-go, protoc-gen-connect-go
  (instalação em `architecture-guide.md §5`).
- Node.js ≥22 / npm ≥10.

## Passos

1. Editar `package.json` raiz e adicionar:
   ```jsonc
   {
     "scripts": {
       "gen": "buf generate && cd backend && sqlc generate",
       "backend:check": "cd backend && sqlc vet && go vet ./... && go build ./... && go test ./...",
       "lint": "npm run lint --workspaces --if-present",
       "build": "npm run build --workspaces --if-present",
       "check": "npm run lint && npm run build && buf lint && npm run backend:check"
     }
   }
   ```
2. Revisar cada script contra sintaxe bash-only: nada de `$(...)`, globs soltos ou aspas
   simples (`cmd.exe` do Windows não suporta). `&&` e `cd X` são seguros nos dois shells.
3. Rodar cada script uma vez num repo quase vazio e ajustar até terminar sem erro de shell
   (`buf lint`/`sqlc vet` só ficam verdes a partir da S0-04/S0-06 — até lá o esperado é
   "ferramenta ausente/arquivo ausente", nunca erro de sintaxe).
4. Documentar os 4 scripts + `backend:check` no `README.md` (uma linha cada) e listar as
   ferramentas exigidas no PATH.

## Critérios de aceite

- [x] `npm run check` encadeia lint+build dos workspaces e os checks do backend sem erro de shell
- [x] `npm run gen` está pronto para regenerar stubs proto/sqlc quando existirem (S0-04/S0-06)
- [x] Nenhum script requer bash/WSL — revisão linha a linha confirma portabilidade (D-13)
- [x] README explica os scripts e o toolchain exigido

## Verificação

```bash
npm run check        # conjunto global canônico (buf · sqlc · go · npm workspaces)
npm run gen          # smoke de shell: termina sem erro de sintaxe
npm run lint && npm run build
```

## Notas

- Se um dia um passo precisar de lógica real (loops, condicionais), escreva um script Node em
  `scripts/` e chame-o via npm — nunca `.sh`/`.ps1` paralelos.
- Alternativa `go -C backend test ./...` dispensa o `cd`, mas `cd backend && …` é legível e
  igualmente portátil entre cmd.exe e POSIX sh.
- `--workspaces --if-present` não falha quando um pacote ainda não tem o script — essencial
  enquanto frontend/remotion-kit/runner estão vazios (scaffolds nas S0-09+, S3-06, S5-03).

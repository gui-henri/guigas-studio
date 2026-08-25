# Guigas Studio

Plataforma auto-hospedada que transforma posts do blog em vídeos YouTube (8–12 min) + shorts com avatar animado, com intervenção humana só onde importa.

## Toolchain

Requisitos no PATH: Node.js ≥22 / npm ≥10, Go ≥1.22, `buf`, `sqlc`, `protoc-gen-go`, `protoc-gen-connect-go`.

| Script | O quê |
| --- | --- |
| `npm run gen` | Regenera stubs (`buf generate` + `sqlc generate`) |
| `npm run lint` | Lint dos workspaces npm (se presente) |
| `npm run build` | Build/typecheck dos workspaces npm (se presente) |
| `npm run test` | Testes unitários JS dos workspaces (vitest; Go roda no `check`) |
| `npm run backend:check` | `sqlc vet` + `go vet` + `go build` + `go test` |
| `npm run check` | Conjunto global canônico: lint + build + buf lint + backend |

- Visão de produto: [`SPEC.md`](SPEC.md)
- Decisões de fundação: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Roadmap de construção e tarefas: [`docs/tasks/ROADMAP.md`](docs/tasks/ROADMAP.md)

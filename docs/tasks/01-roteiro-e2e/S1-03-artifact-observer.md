---
id: S1-03
titulo: "Observador de artefatos: fsnotify → validação → script_review"
sprint: 1
prioridade: P0
depende_de: [S1-01, S1-02, S0-15]
estimativa_h: 2
status: done
---

# S1-03 — Observador de artefatos (script.json)

## Objetivo

Fechar o laço do fluxo OpenCode (D-14): quando o agente grava `script.json` no workspace,
o server detecta (fsnotify), valida contra o contrato (S1-02) e move o vídeo de
`script_pending → script_review` com registro no Postgres e evento; scripts inválidos
geram log estruturado e **não** mudam o status.

## Contexto

É o observador descrito em `SPEC.md §4.2`. Depende do workspace canônico (S1-01), do
validador `backend/internal/artifacts` (S1-02) e do módulo de estados (S0-15). O evento
`script.validated` será consumido pela UI via SSE (S1-05); como o hub ainda não existe
nesta tarefa, publique através de uma interface pequena (`Publisher`) com implementação
noop — o hub pluga depois sem tocar no observador.

## Pré-requisitos

- S1-01, S1-02, S0-15 `done`; compose dev com Postgres (S0-05) para os registros.
- Pacote Go: `github.com/fsnotify/fsnotify` (dependência nova, registrar no go.mod).

## Passos

1. Migração incremental em `backend/internal/database/migrations/`: tabela
   `video_artifact_parses` (id uuid pk, video_id fk → videos, artifact text, valid bool,
   errors jsonb, created_at timestamptz) + queries sqlc (`InsertArtifactParse`,
   `ListParsesByVideo`) em `backend/internal/database/queries/`.
2. Definir `backend/internal/artifacts/publisher.go`: interface `Publisher`
   (`PublishScriptValidated(videoID, slug)`) + impl noop (hub real entra na S1-05).
3. Criar `backend/internal/artifacts/observer.go`: watch fsnotify sobre `/data/videos`
   adicionando recursivamente novos diretórios; filtro apenas `*/script.json`;
   **debounce** por path (~500 ms, timer que reseta a cada evento) para coalescer
   escritas múltiplas/renames atômicos de editores.
4. Fluxo válido: localizar vídeo pelo slug → `Transition(script_pending → script_review)`
   via videostate → `InsertArtifactParse(valid=true)` → `Publisher.PublishScriptValidated`.
5. Fluxo inválido: `ValidateScript` retorna erros → `InsertArtifactParse(valid=false,
   errors)` + log estruturado (slog) com a lista; status permanece `script_pending`.
6. Tratar reescritas feitas pelo próprio server (S1-04): revalidar e registrar, mas
   transição repetida é recusada pelo videostate e ignorada com log debug.
7. Unit tests (D-18): tabela de casos do validador já coberta na S1-02; testar debounce
   (N eventos → 1 validação) e o gate de transição com fake do Publisher.

## Critérios de aceite

- [x] `script.json` válido move o vídeo para `script_review` (debounce 500 ms + processamento; verificado no teste de integração)
- [x] Parse registrado no PG (válido e inválido), consultável por vídeo
- [x] Script inválido: log estruturado com os erros; status permanece `script_pending`
- [x] Debounce coalesce rajadas de eventos de escrita (testado — 20 eventos → 1 disparo)
- [x] Toda transição passa pelo módulo videostate — nenhum IF de estado inline (T-08)

## Verificação

```bash
npm run check
cd backend && go test ./internal/artifacts/...
# Smoke (vídeo em script_pending no compose dev):
printf '{ "quebrado": true }' > /data/videos/<slug>/script.json        # → log de erros
cp backend/internal/artifacts/testdata/script.valid.json /data/videos/<slug>/script.json
docker compose logs api | grep -i artifacts                             # transição registrada
```

## Notas

- fsnotify não observa recursivamente por padrão — adicione o watch ao receber `Create`
  de diretório; na VPS Linux usa inotify (barato, sem polling).
- Escrita atômica (`tmp` + rename) dispara `CREATE`+`WRITE`: é exatamente o caso do
  debounce; sem ele, o validador pode ler arquivo parcial.
- Vídeo fora de `script_pending` (já em `script_review`/`script_approved`): valide e
  registre, mas não transiciona — o videostate recusa e isso não é erro.
- `printf > script.json` no smoke sobrescreve o arquivo do agente de propósito: use um
  vídeo de teste, nunca um workspace real.

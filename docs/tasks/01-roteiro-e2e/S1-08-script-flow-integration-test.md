---
id: S1-08
titulo: "Teste integração: watcher → context pack → script válido/inválido → aprovação"
sprint: 1
prioridade: P1
depende_de: [S1-03, S1-04]
estimativa_h: 2
status: todo
---

# S1-08 — Teste de integração do fluxo de roteiro E2E

## Objetivo

Um teste de integração ponta-a-ponta provando o trecho de roteiro do pipeline com os
componentes reais: fixture de feed RSS → watcher cria vídeo → context pack gerado →
`script.json` válido escrito → observador transiciona → `UpdateScript` edita →
`ApproveScript` aprova; mais o caso negativo (script inválido permanece em
`script_pending` com log de erros). Roda contra o Postgres de teste do compose (D-18).

## Contexto

É o guard-rail de regressão do Sprint 1: cobre watcher (S0-16), gerador (S1-01),
observador (S1-03) e services (S1-04) integrados de verdade — não mocks de unidade.
Excluído do suite unitário via build tag `integration` para manter `go test ./...`
rápido (CI D-15 segue rodando o suite normal).

## Pré-requisitos

- S1-03 e S1-04 `done`; compose dev com Postgres de pé (S0-05).
- Database de teste dedicado (ex.: `studio_test`) criado no Postgres do compose;
  credenciais conforme `.env.example`.
- Binário `git` disponível (commits do workspace temporário — T-07).

## Passos

1. Criar `backend/internal/integration/script_flow_test.go` com `//go:build integration`
   e helpers: aplicar migrações (runner embutido, T-05), truncar tabelas entre casos e
   usar `t.TempDir()` como workspace raiz.
2. Configurar o processo sob teste via env da config (S0-03): diretório de vídeos
   apontando para o temp dir e feed RSS apontando para um `httptest.Server` servindo
   `testdata/feed.xml` (fixture com 2 itens, GUID único por run — sufixo de timestamp).
3. Caso positivo: executar um ciclo do watcher → vídeo criado em `script_pending` com a
   árvore/context pack no disco (assert FS) → escrever `script.json` válido (fixture da
   S1-02) → aguardar observador transicionar para `script_review` → chamar `UpdateScript`
   alterando `narration_pt` → `ApproveScript` → assert `script_approved`, histórico
   completo no PG, parse válido registrado e commit do git presente no temp dir.
4. Caso negativo: segundo item do feed; escrever `script.json` inválido (beat
   desconhecido + shorts fora de sequência) → status permanece `script_pending`, parse
   inválido registrado com erros no PG e o log capturado (handler slog de teste) contém
   as mensagens de erro.
5. Asserts de eventos: publisher fake (interface da S1-03) registra
   `script.validated`; transições aparecem no histórico consultável.
6. Documentar o comando de execução (abaixo); opcional: job noturno no CI rodando a tag
   `integration` — não obrigatório nesta tarefa.

## Critérios de aceite

- [ ] Caso positivo cobre watcher → context pack → observador → UpdateScript →
      ApproveScript com asserts de estado no PG e no FS
- [ ] Caso negativo prova estagnação segura em `script_pending` + registro estruturado
      dos erros
- [ ] Suite isolada e re-executável (truncates + GUID único por run)
- [ ] Sem a tag, `go test ./...` não executa integração (suite unitária rápida)

## Verificação

```bash
npm run check
docker compose up -d postgres
cd backend && TEST_DATABASE_URL="postgres://studio:studio@localhost:5432/studio_test?sslmode=disable" \
  go test -tags=integration -v ./internal/integration/...
```

## Notas

- Interval de poll do watcher deve ser injetável via config (valor curto no teste) —
  dormir tempo fixo torna o teste lento e flaky.
- Dedup do watcher é por GUID no PG (S0-16): GUID fixo faria a segunda execução falhar
  silenciosamente (vídeo nunca criado) — por isso o sufixo de timestamp.
- Se portas/credenciais do compose divergirem, ajuste apenas o `TEST_DATABASE_URL` —
  nada no teste deve depender de valores hardcoded além do default acima.

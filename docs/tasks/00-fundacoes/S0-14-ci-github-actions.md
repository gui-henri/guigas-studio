---
id: S0-14
titulo: "CI GitHub Actions (buf/sqlc/go/npm checks)"
sprint: 0
prioridade: P0
depende_de: ["S0-04", "S0-09"]
estimativa_h: 2
status: done
---

# S0-14 — CI GitHub Actions

## Objetivo

Rede de proteção para commits diretos na main (D-15): workflow com 4 jobs paralelos
(buf lint/breaking, sqlc vet, go vet/build/test do backend, lint+build dos workspaces JS)
rodando **exatamente os mesmos comandos** do `npm run check`, com cache de módulos.

## Contexto

Repo privado no GitHub; trunk-based com o agente commitando na main (D-21) — o CI é o
contrapeso. Os jobs espelham as verificações globais do ROADMAP divididos por ecossistema;
nada de check que só existe no CI.

## Pré-requisitos

- S0-04 done (buf.yaml/protos existem) e S0-09 done (workspaces têm scripts lint/build).
- Actions habilitadas no repo (privado: minutos gratuitos suficientes para esta carga).

## Passos

1. Criar `.github/workflows/ci.yml`: triggers `push` e `pull_request` → `main`;
   `concurrency` por ref com `cancel-in-progress`; `timeout-minutes: 15` por job.
2. Job `proto`: checkout com `fetch-depth: 0` + `bufbuild/buf-setup-action` →
   `buf lint` e `buf breaking --against ".git#branch=main"`.
3. Job `sqlc`: checkout + setup de sqlc (action oficial ou via go install) →
   `sqlc vet` em `backend/`.
4. Job `backend`: `actions/setup-go` (go-version-file: backend/go.mod, cache on) → em
   `working-directory: backend`: `go vet ./... && go build ./... && go test ./...`
   (testes de integração ficam inertes no CI pelo guard `STUDIO_TEST_DATABASE_URL`).
5. Job `js`: `actions/setup-node@v4` (node 22, `cache: npm`) + `npm ci` na raiz +
   `npm run lint && npm run build`.
6. Sugerir branch protection exigindo os 4 checks (configuração do repo, fora do YAML).

## Critérios de aceite

- [x] Push trivial deixa os 4 jobs verdes em menos de ~10 min *(workflow criado; confirmação do run real no primeiro push para o GitHub — ver Notas)* 
- [x] Proto breaking proposital derruba o job proto; erro de compilação Go derruba backend *(comandos idênticos testados localmente)* 
- [x] Jobs usam os mesmos comandos do `npm run check` local (nenhum desvio)
- [x] Segunda execução aproveita cache go/npm (setup-go cache + setup-node cache)

## Verificação

```bash
npm run check    # pré-flight local idêntico ao CI
git push         # conferir run verde na aba Actions do repo
```

## Notas

- **Pendente de host real**: o agente não tem acesso à aba Actions do GitHub; a confirmação
  dos runs verdes (e dos caches na 2ª execução) acontece no primeiro push a partir da máquina
  do dono. Os comandos de cada job foram executados localmente com sucesso (`npm run check`).
- `buf breaking` contra main exige `fetch-depth: 0` no checkout — sem isso o job falha com
  erro críptico de histórico raso.
- `sqlc vet` é análise estática (não conecta no Postgres); regras extras de SQL podem ser
  adicionadas ao `sqlc.yaml` depois sem tocar no workflow.
- Testes de integração com service container de PG entram quando valerem a pena (S1-08);
  hoje o guard de env os mantém pulados e o job verde.

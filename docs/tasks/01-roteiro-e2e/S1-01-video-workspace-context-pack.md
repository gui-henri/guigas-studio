---
id: S1-01
titulo: "Workspace canônico de vídeo + gerador de context pack"
sprint: 1
prioridade: P0
depende_de: [S0-16]
estimativa_h: 2
status: done
---

# S1-01 — Workspace canônico + gerador de context pack

## Objetivo

Criar o gerador que materializa, a cada vídeo novo, o workspace canônico em
`/data/videos/<slug>/` (git próprio — T-07) conforme a árvore do ROADMAP: `context/`
(`post.md`, `linked/`, `method/`, `AGENTS.md`), `audio/`, `timelines/`, `assets/`,
`renders/` e `releases/`. O watcher (S0-16) passa a invocar este gerador ao registrar um
post: a transição `new → script_pending` sinaliza que o rascunho está pronto para o
OpenCode (D-14).

## Contexto

`SPEC.md §4.1` define o context pack; `D-14` fixa que o OpenCode roda via **SSH dentro de
`videos/<slug>/`**, então `context/AGENTS.md` é a única instrução que o agente de roteiro
vê — ele precisa carregar convenções do Studio, os beats do método e o contrato do
`script.json`. Os templates vivem **versionados neste repositório**
(`backend/internal/templates/`) para evoluírem com histórico; cada workspace congela a
versão usada na sua geração. Módulos tocados: watcher (S0-16),
`backend/internal/domain/videostate` (S0-15).

## Pré-requisitos

- S0-16 `done` (watcher insere vídeos com status `new`) e S0-15 `done` (transições válidas).
- `/data/videos` inicializado como repositório git no primeiro boot (T-07) e binário `git`
  acessível ao container da api.

## Passos

1. Criar `backend/internal/templates/` com `embed.go` (`//go:embed`) e os arquivos:
   `agents.md`, `method/beats.md` (Hook/Setup/Example/Payoff/CTA) e `method/shorts.md`
   (marcação `[SHORT#n]` e critério de trecho auto-contido).
2. Escrever o conteúdo de `agents.md` (em PT-BR): convenções do Studio (narração pt-BR,
   legendas en — SPEC §2 #3), os 5 beats e quando usar cada um, regra do `[SHORT#n]`
   (hook próprio + exemplo + CTA, recortável sem contexto), formato do `script.json`
   (estrutura `StudioScript`, enums de beat/emotion) e instrução final: gravar o arquivo
   na raiz do workspace como `script.json`.
3. Criar `backend/internal/workspace/scaffold.go`: `Scaffold(slug, post)` cria a árvore
   completa do ROADMAP, copia os templates para `context/` (incluindo `method/`),
   grava `context/post.md` com o conteúdo do post RSS e deixa `context/linked/` pronto
   (populada quando o parser encontrar links explícitos — SPEC §2 #16).
4. Garantir no `.gitignore` de `/data/videos` as entradas de binários (`audio/`,
   `renders/`, `*.wav`, `*.mp4` — D-11); o gerador cria/complementa o arquivo se faltar.
5. Executar a transição `new → script_pending` **via módulo videostate** (S0-15) e então
   commitar o context pack no git do workspace (mensagem `chore(<slug>): scaffold context
   pack`) — T-07: o server commita texto a cada transição validada.
6. Integrar ao watcher: no handler de novo post (S0-16), chamar `Scaffold` logo após o
   INSERT; em falha, log estruturado e o vídeo permanece `new` (retry natural no próximo
   poll — ver Notas).
7. Unit tests (D-18): árvore esperada criada; templates presentes no `context/`;
   idempotência (rodar duas vezes não sobrescreve `AGENTS.md` nem `post.md`).

## Critérios de aceite

- [x] Post novo no RSS gera a árvore completa do ROADMAP, com `context/AGENTS.md`
      trazendo convenções, beats, `[SHORT#n]` e o contrato do `script.json`
- [x] `new → script_pending` executada exclusivamente pelo módulo videostate
- [x] Context pack commitado no git do workspace; binários ficam fora do git
- [x] Gerador é idempotente (nunca sobrescreve trabalho existente do agente)
- [x] Testes unitários + integração E2E (feed→workspace→git→status) verdes (D-18)

## Verificação

```bash
npm run check
cd backend && go test ./internal/workspace/... ./internal/templates/...
# Smoke com compose dev de pé (publicar/atualizar o feed configurado):
docker compose exec api find /data/videos/<slug> -maxdepth 2   # árvore completa
git -C /data/videos log --oneline -1                           # commit do scaffold
```

## Notas

- Slug sanitizado (minúsculas/hífens) é responsabilidade do watcher S0-16 — reutilize a
  mesma função, não duplique.
- Falha no scaffold mantém o vídeo em `new` (retry barato) em vez de `blocked`;
  `blocked` reserve-se para estados irrecuperáveis sem ação humana.
- Nunca criar/escrever `script.json` nesta tarefa — ele nasce pela mão do OpenCode (D-14)
  ou do `UpdateScript` (S1-04).
- Se `/data/videos` não for um repo git, falhar rápido com erro claro (T-07 assume o init
  no primeiro boot); configurar `user.name`/`user.email` locais ("Studio Server") no
  primeiro commit para não depender do git global do host.

---
id: S4-07
titulo: "Fluxo de cenas do OpenCode: instruções + validação → scenes_review"
sprint: 4
prioridade: P0
depende_de: [S1-03, S4-01]
estimativa_h: 2
status: todo
---

# S4-07 — Fluxo de cenas do OpenCode

## Objetivo

Fechar o circuito de geração de cenas: o AGENTS.md do context pack passa a carregar o
catálogo e as regras da gramática (só props válidos); o OpenCode escreve o campo `scene`
por segmento no `script.json`; o observador valida as props contra o JSON Schema da
S4-01 e transiciona `scenes_pending` → `scenes_review`; erros de validação voltam como
log legível para correção conversacional (D-14).

## Contexto

Mesma mecânica já provada no fluxo de roteiro: OpenCode via SSH dentro de
`videos/<slug>/` (D-14), observador fsnotify → validação → transição + evento SSE
(S1-03). O que muda: a validação aqui é das cenas (union da S4-01) e só roda no estado
`scenes_pending`. A aprovação humana dos cards (saída de `scenes_review`) é a S4-08;
a ida para `queued` é a S5-01.

## Pré-requisitos

- S1-03 com observador operante para `script.json` (+ fallback de polling, se implementado).
- S4-01 com `remotion-kit/schema/scene-props.schema.json` commitado.
- Vídeo em estado `scenes_pending` para teste (fixtures da S3-04/S3-05 servem).

## Passos

1. Estender o gerador de context pack (S1-01): nova seção "Cenas" no AGENTS.md com a
   tabela resumo dos 7 tipos (`scene.type` → propósito em 1 linha), apontador para
   `docs/guides/scene-catalog.md` e as regras duras: só types válidos; só props da
   gramática; nada de CSS/estilo/cor livre; `scene: null` = só avatar.
2. Incluir na seção um exemplo mínimo de escrita por segmento (trecho de `script.json`
   com `scene` preenchido) copiado do catálogo — o agente não deve precisar abrir o repo
   de código.
3. Estender o observador (S1-03): no estado `scenes_pending`, escrita em `script.json`
   dispara validação das cenas contra `scene-props.schema.json`. Válido → transição
   codificada no módulo `videostate` (S0-15/T-08) para `scenes_review` + evento SSE.
   Inválido → permanece `scenes_pending`.
4. Erro legível ao agente: gravar `.validation-latest.json` na raiz do workspace com
   issues estruturados (`segment_id`, caminho do prop, mensagem, tipo esperado) e
   adicionar o arquivo ao `.gitignore` do workspace; AGENTS.md instrui o agente a lê-lo
   após cada escrita antes de dar a tarefa por pronta.
5. Testes de integração (padrão S1-08): script fixture com 1 cena válida → transiciona
   e publica evento; com 1 cena inválida → não transiciona e `.validation-latest.json`
   contém o caminho exato do prop quebrado.

## Critérios de aceite

- [ ] AGENTS.md gerado contém a seção "Cenas" com os 7 tipos e a regra "props only"
- [ ] Cena válida salva no workspace move o card para `scenes_review` sem intervenção manual
- [ ] Cena inválida NÃO transiciona; relatório aponta segmento + prop + motivo
- [ ] Evento SSE publicado nas duas ramificações (hub da S1-05)
- [ ] Transição passa pelo módulo de estados com unit test (nunca inline)

## Verificação

```bash
npm run check
go test ./backend/internal/services/... -run Scenes
npm run test -w remotion-kit -- src/scenes
```

## Notas

- Validar JSON Schema no Go (biblioteca de JSON Schema), NÃO portar Zod — mesmo padrão
  da S1-02/D-01. Uma única fonte: o schema exportado pela S4-01.
- Escritas atômicas do OpenCode (rename) podem escapar do fsnotify: se a S1-03 não tiver
  fallback, adicionar re-validação periódica (~30 s) apenas em `scenes_pending`.
- O ciclo conversacional (escreve → watcher valida em segundos → agente lê o relatório →
  corrige) dispensa qualquer endpoint/RPC novo na v1 — documentar o loop é papel da S4-10.

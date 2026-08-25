---
id: S1-06
titulo: "UI revisão de roteiro: visualização estruturada + diff original↔editado"
sprint: 1
prioridade: P0
depende_de: [S1-04, S1-05, S0-12]
estimativa_h: 2
status: todo
---

# S1-06 — UI de revisão de roteiro

## Objetivo

Página de revisão do roteiro no dashboard: visualização estruturada por segmentos
(badges de beat/emotion, narração, marcadores `[SHORT#n]`), diff lado a lado entre a
versão original do agente e a edição corrente, e navegação por segmento. É a tela onde o
humano enxerga o trabalho do OpenCode antes de aprovar (`script_review`).

## Contexto

Consome `GetVideo` da S1-04 (`script`, `original_script`, histórico) e atualiza ao vivo
via `useStudioEvents` (S1-05). Encaixa-se sobre o shell/fila da S0-12 com os design
tokens do blog (S0-11). Ações (salvar/aprovar/rejeitar) ficam deliberadamente fora —
entradas na S1-07; aqui é somente leitura.

## Pré-requisitos

- S1-04, S1-05, S0-12 `done`; ao menos um vídeo em `script_review` para teste visual
  (fixture da S1-02 escrita num workspace local serve).
- Dependência npm nova no workspace `frontend`: `diff` (jsdiff) para o diff campo a campo.

## Passos

1. Rota `/videos/:id` em `frontend/src/App.tsx` e página
   `frontend/src/pages/ScriptReviewPage.tsx` com `useQuery(['video', id])` → `GetVideo`.
2. `frontend/src/components/script/SegmentCard.tsx`: renderiza `id`, badge do beat,
   badge da emotion, `narration_pt` (serif), badge do short (`[SHORT#n]` + hook/cta)
   quando presente e tipo da cena quando houver — dados já tipados pelos stubs TS
   (`frontend/src/gen`).
3. `frontend/src/components/script/ScriptDiff.tsx`: painel lado a lado
   `original_script ↔ script` por segmento usando jsdiff (comparação por campo,
   destaque nas linhas alteradas); toggle para mostrar/ocultar o diff.
4. Navegação: rail lateral listando segmentos (`id` + beat); clique seleciona/faz
   scroll até o card; indicador visual nos segmentos alterados vs original.
5. Header: slug, chip de status colorido, `durationMin` alvo, contagem de shorts e link
   de volta à fila (S0-12).
6. Tempo real: invalidar `['video', id]` ao receber `script.validated` /
   `video.status_changed` (hook da S1-05) — a tela reflete reescritas do agente sem F5.
7. Estados: skeleton de carregamento; erro com retry; script ausente com instrução de
   abrir o OpenCode no workspace (referenciar `docs/guides/opencode-scripting.md`, S1-09).

## Critérios de aceite

- [ ] Todos os segmentos renderizam com beat/emotion/narração/badges corretos
- [ ] Diff lado a lado destaca exatamente as diferenças entre original e edição atual
- [ ] Navegação por segmento funcional (rail + seleção/scroll)
- [ ] Reescrita do `script.json` pelo agente aparece na tela sem reload manual (SSE)
- [ ] `npm run build --workspace frontend` verde (typecheck incluso)

## Verificação

```bash
npm run check
npm run dev --workspace frontend
# Manual: abrir /videos/<id> de um vídeo em script_review;
# tocar no script.json (touch) e confirmar atualização ao vivo.
```

## Notas

- Diff é client-side (jsdiff) — sem serviço novo no backend; compare campo a campo
  (`narration_pt`, etc.), não JSON inteiro, para não acusar diferença de formatação.
- `original_script` é congelada na primeira validação (S1-04 passo 6): o diff mostra o
  que o humano mudou em relação ao agente, mesmo depois de salvar edições.
- Página somente leitura nesta tarefa: separar leitura (S1-06) de escrita (S1-07) mantém
  cada commit coeso e facilita revisar estados antes das mutations.

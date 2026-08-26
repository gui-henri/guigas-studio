---
id: S4-04
titulo: "Componentes FlowDiagram, BigNumber e Timeline"
sprint: 4
prioridade: P1
depende_de: [S4-01]
estimativa_h: 2
status: done
---

# S4-04 — Componentes FlowDiagram, BigNumber e Timeline

## Objetivo

Fechar o kit de dados/diagramas do SPEC §4.5: `FlowDiagram` (nós/arestas declarativos
com layout fixo por colunas), `BigNumber` (número gigante animado com label/contexto) e
`Timeline` (marcos temporais com entrada sequencial) — mesmas convenções das S4-02/S4-03.

## Contexto

Última leva de componentes antes do compositor (S4-05 registrar todos no registry).
Layout de grafo é onde agentes costumam exagerar: aqui é layout FIXO por colunas
declarado nos props — sem auto-layout, sem lib de grafos, determinismo total para o
render final.

## Pré-requisitos

- S4-01 com `sceneSchema` (`flow_diagram`, `big_number`, `timeline`).
- Convenções da S4-02 vigentes: `theme.ts`, fixtures, vitest, zero aleatoriedade.

## Passos

1. Função pura `layoutColumns(nodes, opts)` em `src/scenes/flow-diagram/layout.ts`:
   posiciona cada nó na grade `col × índice-na-coluna`, centralizado verticalmente,
   com espaçamento dos tokens — testada (colunas vazias, coluna única, muitos nós).
2. `<FlowDiagram>` consumindo props do schema: nós como cards (serif no label), arestas
   como paths SVG ortogonais com seta, desenhados sequencialmente por frame (entrada
   nó→aresta alternada); aresta referenciando `node.id` inexistente = erro de validação
   claro antes de montar.
3. `<BigNumber>`: count-up determinístico com `interpolate`/`spring()` do Remotion sobre
   `useCurrentFrame`, formatação de número com locale fixo (`en-US`), label em serif e
   contexto opcional abaixo.
4. Função pura `staggerFrames(index, perItemFrames)` em `src/scenes/timeline/stagger.ts`
   (entrada sequencial dos marcos) — testada.
5. `<Timeline>`: marcos entram um a um (dot + label + descrição), linha conectora
   cresce conforme os frames; orientação vertical única.
6. Fixtures válidas contra o schema: `remotion-kit/fixtures/{flow-diagram,big-number,
   timeline}.json` — validadas num teste; insumo dos stills da S4-09.

## Critérios de aceite

- [x] Layout do FlowDiagram é função pura declarada nos props (layoutColumns testada: grade por col, colunas esparsas centradas)
- [x] Aresta órfã (id inexistente) falha na validação com mensagem apontando o catálogo
- [x] Count-up e stagger são determinísticos por frame (interpolate/staggerFrames puros; formatador Intl no nível do módulo)
- [x] Funções puras testadas (10 casos novos); fixtures validam contra `sceneSchema` (D-18)
- [x] Nenhum hex literal fora de `theme.ts`

## Verificação

```bash
npm run check
npm run test -w remotion-kit -- src/scenes/flow-diagram src/scenes/big-number src/scenes/timeline
```

## Notas

## Notas

- Schema ampliado no mesmo commit: `nodes[].col` (int ≥0, default 0) para a grade fixa;
  validação de aresta órfã implementada como pós-checagem em parseScene
  (`flowEdgeIssues`) porque discriminatedUnion exige ZodObject puro — JSON Schema não
  expressa cross-ref; o observador Go (S4-07) replicará a checagem.
- `splitNumericPrefix` deixa BigNumber contar só a parte numérica ("10x", "$1,234.56/mo").
- Opção mais simples registrada: grade por colunas explícita no prop `nodes[].col`.
  Auto-layout por dependências é backlog (kit estendido, SPEC §8 #5).
- Formatação numérica com `Intl.NumberFormat("en-US")` criado uma vez (módulo) — criar
  formatador por frame é caro em render longo e pode divergir entre browser e node.
- `spring()` do Remotion é determinístico (função do frame); não substituir por animação
  CSS — quebra o scrub e o render frame-a-frame.

---
id: S4-01
titulo: "Gramática fechada de cenas: union tipada + schemas + catálogo"
sprint: 4
prioridade: P0
depende_de: [S3-06]
estimativa_h: 2
status: todo
---

# S4-01 — Gramática fechada de cenas

## Objetivo

Definir a gramática fechada de cenas (SPEC §4.5): union Zod discriminada por `scene.type`
com schemas de props rígidos para os 7 componentes (`code_typing`, `diff_view`,
`terminal_run`, `flow_diagram`, `big_number`, `timeline`, `callout`), defaults sensatos e
o catálogo documentado em `docs/guides/scene-catalog.md`. É esta gramática que mitiga o
risco "qualidade das cenas do agente" (SPEC §9): o OpenCode só compõe props — nunca CSS livre.

## Contexto

O campo `scene` do `script.json` já existe no contrato `StudioScript` (S1-02, proto +
JSON Schema). Aqui ele ganha forma executável dentro de `remotion-kit/` (scaffold S3-06).
Regras vigentes: Zod só nas props de cena — fronteiras de API usam protojson (D-01); o
`<Player>` roda no bundle da SPA via import direto (T-02), então a gramática precisa ser
enxuta. As cenas são escritas pelo agente durante `scenes_pending` e validadas na entrada
para `scenes_review` (fluxo implementado na S4-07).

## Pré-requisitos

- S3-06 com `remotion-kit` scaffolded e buildável (`npm run build -w remotion-kit` verde).
- Contrato `StudioScript` da S1-02 disponível para consulta (campo `scene` por segmento).

## Passos

1. Criar `remotion-kit/src/scenes/schema.ts` com um ZodObject por componente, todos com
   `.strict()` (prop desconhecido = erro): `code_typing` (code, language?, charsPerSecond?),
   `diff_view` (title?, language?, before[], after[]), `terminal_run` (prompt?, lines[],
   cursor?), `flow_diagram` (nodes[], edges[]), `big_number` (value, label, context?),
   `timeline` (milestones[]), `callout` (variant, title, body, icon?). Shapes mínimos —
   as tarefas dos componentes (S4-02..S4-04) só podem **estreitar** refinamentos internos,
   nunca violar o contrato.
2. Exportar `sceneSchema = z.discriminatedUnion("type", [...])`, os tipos TS inferidos
   (`z.infer`) e `parseScene(raw)` retornando `{ ok: true, scene }` ou `{ ok: false,
   issues }` com caminho + mensagem legível (ex.: `nodes[2].label: required`).
3. Aplicar defaults sensatos via `.default()` em opcionais (ex.: `charsPerSecond: 18`,
   `prompt: "$"`, `cursor: true`). Cores/fontes NUNCA entram nos dados — resolvem-se dos
   tokens no componente.
4. Criar script `scenes:schema` no `package.json` do remotion-kit gerando
   `remotion-kit/schema/scene-props.schema.json` via `zod-to-json-schema` — mesmo padrão
   da S1-02, consumido pelo observador Go na S4-07.
5. Testes unitários (vitest): 1 caso válido + 1 inválido por tipo, `type` desconhecido,
   prop extra rejeitado e defaults aplicados (D-18).
6. Escrever `docs/guides/scene-catalog.md`: intro com as regras da gramática + uma seção
   por componente com propósito, tabela de props (nome/tipo/default/descrição), exemplo
   JSON mínimo e placeholder de print (`<!-- print pendente: S4-09 -->`).

**Convenções**: código/identificadores em EN; docs em PT-BR; paridade com o proto de
S1-02 mantida no mesmo commit quando o contrato mudar.

## Critérios de aceite

- [ ] Os 7 tipos validam; `type` desconhecido e prop extra falham com mensagem clara
- [ ] `parseScene` reporta o caminho exato do prop problemático
- [ ] `schema/scene-props.schema.json` gerado e commitado; o exemplo `scene` do SPEC §3 valida nele
- [ ] Testes cobrindo válidos/inválidos/defaults por tipo (D-18)
- [ ] Catálogo com entrada para cada um dos 7 componentes

## Verificação

```bash
npm run check
npm run test -w remotion-kit -- src/scenes
npm run scenes:schema -w remotion-kit && git status --short remotion-kit/schema/
```

## Notas

- vitest é escolha registrada aqui (primeiro runner de testes JS do repo): alinha com o
  Vite já usado pelo frontend (D-09/D-16). Demais pacotes JS devem reutilizar.
- Não validar Zod no backend Go — o observador consome o JSON Schema (D-01). Se o proto
  de S1-02 divergir, corrigir Zod + JSON Schema no mesmo commit.
- Gramática MÍNIMA de propósito: desejo fora dela vai pro backlog "kit estendido"
  (SPEC §8 #5), não vira exceção nem CSS livre.

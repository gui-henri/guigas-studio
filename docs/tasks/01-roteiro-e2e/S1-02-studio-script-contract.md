---
id: S1-02
titulo: "Contrato StudioScript em proto + JSON Schema p/ validação FS"
sprint: 1
prioridade: P0
depende_de: [S0-04]
estimativa_h: 2
status: todo
---

# S1-02 — Contrato StudioScript (proto) + JSON Schema

## Objetivo

Definir em Protobuf o contrato do roteiro único (`StudioScript`, SPEC §3) — fonte de
verdade consumida pelo observador (S1-03), VideoService (S1-04), UI (S1-06/S1-07) e,
depois, pelo remotion-kit — e exportar um **JSON Schema** dele para validar o
`script.json` que o OpenCode escreve no filesystem.

## Contexto

O `script.json` vive no workspace (T-07) e é escrito por um agente fora do processo Go;
a fronteira de validação é JSON. Por D-01, Zod **não** existe mais nas fronteiras da API:
validação FS usa JSON Schema + protojson estrito; Zod sobrevive só onde o Remotion exige
(props). Referência literal dos campos: `SPEC.md §3`. Pipeline de codegen: `buf.gen.yaml`
da S0-04.

## Pré-requisitos

- S0-04 `done` (buf + codegen Go/TS funcionando via `npm run gen`).
- Ferramentas: buf, protoc-gen-go, node ≥22 (já exigidas pelas verificações globais).

## Passos

1. Criar `proto/app/studio/v1/script.proto` (package `app.studio.v1`) com mensagens
   fieis ao SPEC §3: `StudioScript` (`post`, `language`, `target`, `related`,
   `segments`, `social`), `Language{spoken, subtitles}`, `Target{duration_min}`
   (JSON `durationMin`, `int32`), `Segment{id, beat, emotion, narration_pt, scene,
   short}`, `SceneRef{type, props}` (props = `google.protobuf.Struct` — aberto até a
   gramática de cenas da S4-01), `ShortMarker{id, hook, cta}` (id `uint32`) e
   `SocialCopy{x_thread, linkedin, instagram_caption}`.
2. Criar os enums: `Beat` (`BEAT_HOOK`, `BEAT_SETUP`, `BEAT_EXAMPLE`, `BEAT_PAYOFF`,
   `BEAT_CTA`) e `Emotion` com os 5 estados do sprite (SPEC §2 #7): `EMOTION_IDLE`,
   `EMOTION_SPEAKING`, `EMOTION_HAPPY`, `EMOTION_THOUGHTFUL`, `EMOTION_SURPRISED`.
   Documentar no header do .proto que o JSON canônico usa esses nomes (ver Notas).
3. Rodar `npm run gen` e conferir stubs novos em `backend/gen/` e `frontend/src/gen/`.
4. Exportar JSON Schema: instalar plugin `protoc-gen-jsonschema` (ex.: `go install
   github.com/pubg/protoc-gen-jsonschema/cmd/protoc-gen-jsonschema@latest`) e adicioná-lo
   ao `buf.gen.yaml` (plugin `local`, saída `backend/internal/artifacts/schemas/`);
   commitar o `studio_script.schema.json` gerado. Caminho alternativo documentado: gerar
   uma vez via CLI e commitar o artefato (passo equivalente).
5. Criar `backend/internal/artifacts/` com `schema.go` (go:embed do schema) e
   `validate.go`: `ValidateScript(data []byte) (*studiov1.StudioScript, []error)` —
   protojson estrito (`DiscardUnknown: false`) + regras que JSON Schema puro não cobre:
   ids de segmento únicos, beats conhecidos, shorts sequenciais (1..N) auto-contidos.
6. Teste golden (D-18): fixture com o exemplo do SPEC §3 deve passar no schema
   (biblioteca `github.com/santhosh-tekuri/jsonschema/v6`) e no protojson estrito;
   mutações (campo desconhecido, beat inválido, short fora de sequência) devem falhar
   com erros claros.

## Critérios de aceite

- [ ] `buf lint` verde; stubs Go+TS regenerados sem breaking (CI D-15)
- [ ] `studio_script.schema.json` commitado e embutível via go:embed
- [ ] Exemplo do SPEC §3 passa no schema e no protojson estrito; mutações grosseiras falham
- [ ] `ValidateScript` retorna erros enumerados (não só "inválido") para uso no log da S1-03
- [ ] Nenhum Zod no caminho de validação FS (D-01)

## Verificação

```bash
npm run check
buf generate
cd backend && go test ./internal/artifacts/...
```

## Notas

- protojson serializa enums como `BEAT_HOOK`/`EMOTION_HAPPY`, não os literais minúsculos
  do jsonc ilustrativo do SPEC §3 — o proto passa a ser o contrato canônico; deixe isso
  explícito no header do `.proto` para não gerar dúvida no OpenCode.
- `SceneRef.props` como `Struct` é deliberado: tipagem fechada de cenas entra na S4-01;
  não antecipe union de tipos aqui.
- O JSON Schema cobre tipos/campos/enums; regras relacionais (ids únicos, sequência de
  shorts) moram no validador Go — dividida assim porque o schema é consumido por agentes
  externos e o código por nós.
- Se o plugin de schema divergir do protojson em algum detalhe (ex.: `int64` como
  string), ajuste o tipo no proto antes de gambiarras no schema.

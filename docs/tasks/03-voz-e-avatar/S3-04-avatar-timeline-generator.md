---
id: S3-04
titulo: "Gerador `avatar.timeline.json`: visemes + estados + word timings (proto-validado)"
sprint: 3
prioridade: P0
depende_de: ["S3-02", "S3-03"]
estimativa_h: 2
status: todo
---

# S3-04 — Gerador `avatar.timeline.json`

## Objetivo

Serviço que consolida, por segmento, o `avatar.timeline.json` — visemes (boca) + estados
corpo/expressão derivados das blendshapes gravadas + word timings — validado contra o
schema proto antes de gravar em `timelines/`. Ao completar todos os segmentos, dispara a
transição `voice_processing → scenes_pending` (gatilho canônico do ROADMAP).

## Contexto

- ROADMAP → Máquina de estados: `scenes_pending` = "pipeline de voz ok (S3-04)"; toda
  transição passa pelo módulo `videostate` (T-08, S0-15) — nunca inline.
- SPEC §4.4: saída do processamento de voz é o `avatar.timeline.json` (A–H+X + estados).
- Contratos em proto (D-01): mensagens novas em `proto/app/studio/v1/` + codegen Go/TS
  (S0-04). O TS gerado alimenta o rig Remotion (S3-07) — sem duplicar schemas.
- Entradas: visemes (S3-03), `<segment-id>.blendshapes.json` (S2-07) e word timings
  (S3-02). O mapeamento blendshapes→estados nasceu na S2-03 (browser); aqui é reproduzido
  em Go.

## Pré-requisitos

- S3-02 e S3-03 com `status: done`. buf + codegen funcionando (S0-04).

## Passos

1. Proto: mensagens `AvatarTimeline` (`mouth_cues`, `body_states`, `word_timings`,
   `duration_ms`) em `proto/app/studio/v1/timeline.proto`; `buf lint` + regenerar Go/TS.
2. Mapeamento blendshapes→estado em Go (`internal/avatar/states.go`) espelhando a S2-03:
   mesma tabela de decisão e **mesmos fixtures compartilhados** provando paridade Go↔TS.
3. Derivar `body_states` por mudança de estado (delta, não por frame): lista compacta
   `[{state, start_ms, end_ms}]`.
4. Merge no gerador: visemes (boca) + body_states + word_timings + duração do manifest
   (S2-09); onde houver silêncio entre palavras, inserir cue de boca `X`.
5. Validar antes de persistir: serializar e fazer round-trip com `protojson.Unmarshal`
   — o arquivo só toca o disco se for protojson válido do tipo.
6. Gravar em `videos/<slug>/timelines/<segment-id>.timeline.json` (T-07; `timelines/` é
   versionável — diferente de `audio/`).
7. Idempotência + conclusão: processar apenas segmentos sem timeline; quando TODOS
   tiverem timeline, chamar `videostate.Transition(voice_processing → scenes_pending)`
   exatamente uma vez e emitir evento SSE (hub da S1-05).
8. Unit tests com fixtures sintéticas reais (WAV curtíssimo + blendshapes + transcrição
   fake) e golden files do timeline esperado; teste do caminho de falha parcial.

**Convenções**: código em EN; docs em PT-BR; transições só via `videostate` (T-08).

## Critérios de aceite

- [ ] Timeline por segmento válida por round-trip protojson antes de persistir
- [ ] Paridade Go↔TS do mapeamento de estados provada por fixtures compartilhadas
- [ ] `scenes_pending` dispara exatamente uma vez, com todos os segmentos prontos
- [ ] Falha parcial ⇒ vídeo `blocked` com motivo estruturado (não falha silenciosa)
- [ ] Golden tests cobrindo merge, silêncio→X e idempotência

## Verificação

```bash
npm run check
cd backend && buf lint ../proto && go test ./internal/avatar/... -v
```

## Notas

- `protojson` serializa camelCase por padrão: esse É o formato em disco/consumido pelo
  Remotion; fixe as opções explicitamente para evitar surpresa entre Go/TS.
- Este serviço orquestra e mescla; não recomputa visemes nem timings — cada fonte tem
  dono (S3-02/S3-03). Depurar o pipeline fica ordens de magnitude mais fácil assim.
- Segmento sem take aprovado é invariante quebrada (a gravação, S2-08, impede chegar
  aqui nesse estado): trate como erro explícito, não como caso a contornar.

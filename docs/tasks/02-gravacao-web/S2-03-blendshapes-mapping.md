---
id: S2-03
titulo: "Mapeamento blendshapes→estado do sprite (função pura + testes)"
sprint: 2
prioridade: P0
depende_de: [S2-02]
estimativa_h: 1
status: todo
---

# S2-03 — Mapeamento blendshapes → estado do sprite

## Objetivo

Módulo TS puro (sem DOM) que converte os 52 blendshapes do MediaPipe em um dos 5 estados
do sprite da S0-13 (`idle | talking | happy | thoughtful | surprised`) por limiares
configuráveis, e serializa a série temporal compacta gravada como
`<segment_id>.blendshapes.json`.

## Contexto

O contrato de sprite com 5 estados × 4 bocas vem da S0-13 (D-17). O avatar vivo (S2-04)
consome o estado por amostra; o arquivo `.blendshapes.json` montado em S2-07 será
consumido na Sprint 3 (timeline do avatar, S3-04). D-18 pede teste unitário em lógica
pura — este módulo é o candidato ideal e introduz o vitest no repo (primeiro teste JS).

## Pré-requisitos

- S2-02 `done` (formato das amostras definido: `{t, bs[52]}`).
- Node ≥ 22; vitest é adicionado neste passo.

## Passos

1. Adicionar vitest ao `frontend` + script `"test": "vitest run"` no package.json.
2. Criar `frontend/src/recording/stateMapping.ts`:
   - `type SpriteState = 'idle' | 'talking' | 'happy' | 'thoughtful' | 'surprised'`;
   - `interface StateThresholds` com defaults exportados (ex.: `talkJawOpen: 0.25`,
     `smile: 0.35`, `surpriseBrow: 0.45`, `thoughtfulBrowDown: 0.3`,
     `gazeDown: 0.3`, `minHoldMs: 150`);
   - `mapBlendshapesToState(bs: Record<string, number>, th?): SpriteState` com
     precedência documentada no código: `surprised > happy > thoughtful > talking >
     idle` (expressões claras vencem; falar é o estado-base durante a gravação);
   - `smoothStates(samples, th?)`: histerese — descarta estados com permanência menor
     que `minHoldMs` (elimina flicker entre amostras vizinhas).
3. Criar `serializeBlendshapes(samples): BlendshapesFile` — JSON compacto:
   ```jsonc
   {
     "version": 1,
     "approx_fps": 30,
     "samples": [[0, 0.01, 0.02 /* …52 floats, 3 casas */]],
     "state_changes": [[0, "idle"], [420, "talking"]]   // RLE da série suavizada
   }
   ```
4. Fixtures sintéticas em `frontend/src/recording/__fixtures__/`: vetores 52-dim para
   neutro, boca aberta (`jawOpen` alto), sorriso, sobrancelhas levantadas e franzidas,
   mais o caso tudo-zero → `idle`.
5. Testes: cada estado alcançável, precedência respeitada, histerese remove blip de
   uma amostra, snapshot do JSON serializado, determinismo (duas execuções idênticas).

## Critérios de aceite

- [ ] Funções puras e determinísticas; sem acesso a DOM/rede (reaproveitável no runner)
- [ ] Os 5 estados do contrato S0-13 são produzidos a partir dos fixtures
- [ ] JSON serializado ≤ ~1 MB para 5 min a 30 fps (compacidade validada em teste)
- [ ] `npm run test -w frontend` verde e integrado ao fluxo de verificação

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
npm run test -w frontend -- stateMapping
```

## Notas

- A precedência entre estados é escolha simples e reversível — ajuste pelos limiares,
  não mudando a ordem; recalibrar com gravações reais no smoke da S2-10 antes do E2E.
- Entrada como `Record<string, number>` com os nomes das categorias do MediaPipe
  (`jawOpen`, `mouthSmileLeft`, …) evita acoplamento à posição no array.
- O arquivo já carrega os 52 valores crus arredondados: se a Sprint 3 quiser
  granularidade maior, não precisa regravar vídeo nenhum.

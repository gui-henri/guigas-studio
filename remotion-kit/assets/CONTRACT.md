# Sprite Sheet Contract — Guigas Studio Avatar

Consumers (`<AvatarSprite>` no remotion-kit, preview de gravação no frontend) leem
**sempre** `sprite.json` — nunca assumem layout hardcoded.

## Dimensões

| Campo | Valor |
| --- | --- |
| Célula | 256 × 256 px |
| Grade | 4 colunas × 5 linhas |
| PNG final | 1024 × 1280 px |
| Formato | PNG RGBA |

## Linhas (estados — ordem fixa)

1. `idle`
2. `falando`
3. `feliz`
4. `pensativo`
5. `surpreso`

São os 5 estados do SPEC #7. `falando` é o estado base durante narração.

## Colunas (bocas — ordem fixa)

1. `rest` — boca fechada/traço
2. `open_a` — aberta (visemes A/B do Rhubarb)
3. `rounded_o` — arredondada (C/D/E/F)
4. `wide_e` — larga (G/H)

`X` (silêncio) mapeia para `rest`. O colapso fino viseme→coluna é função pura
(S2-03/S3-04); esta fronteira não muda sem atualizar o contrato junto.

## Frames

Identificador: `"${state}/${mouth}"`, ordem row-major (linha 0 inteira, depois linha 1…).
Ex.: `idle/rest`, `idle/open_a`, …, `surpreso/wide_e` — 20 frames.

## Metadados (`sprite.json`)

```jsonc
{
  "image": "sprite-placeholder.png",
  "cellWidth": 256,
  "cellHeight": 256,
  "columns": 4,
  "rows": 5,
  "states": ["idle", "falando", "feliz", "pensativo", "surpreso"],
  "mouths": ["rest", "open_a", "rounded_o", "wide_e"],
  "frames": [{ "name": "idle/rest", "row": 0, "col": 0, "x": 0, "y": 0 }, …]
}
```

## Regra de drop-in (sprite real desenhado à mão)

1. Substituir o PNG mantendo **dimensões idênticas** e **ordem de estados/bocas**, OU
2. Mudar o layout e regenerar/atualizar `sprite.json` junto.

Nenhuma das duas opções exige tocar em código dos consumidores.

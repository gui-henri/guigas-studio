---
id: S0-13
titulo: "Sprite placeholder procedural + contrato de sprite sheet"
sprint: 0
prioridade: P1
depende_de: []
estimativa_h: 2
status: todo
---

# S0-13 — Sprite placeholder procedural + contrato de sheet

## Objetivo

Desacoplar o pipeline do desenho manual (D-17): script Node gera spritesheet PNG
procedural com grade documentada (5 estados × ~4 bocas) e **contrato formal de sprite
sheet** (dimensões, nomes/ordem de frames, metadados JSON) — o sprite real desenhado à mão
entra depois por drop-in, sem tocar código.

## Contexto

Consumidores futuros: rig `<AvatarSprite>` no remotion-kit (S3-07) e feedback vivo na
gravação (S2-04). Estados = os 5 do SPEC #7; bocas simplificadas serão alvo do colapso das
visemes Rhubarb A–H+X (S3-03/S3-04). Local escolhido: `remotion-kit/tools/` + saída em
`remotion-kit/assets/` — junto do pacote que consome.

## Pré-requisitos

- Node ≥22. Nenhum binário nativo (D-13).

## Passos

1. Adicionar devDependency `pngjs` ao `remotion-kit` (encoder PNG puro JS) e criar
   `remotion-kit/tools/generate-sprite.mjs`.
2. Fixar o contrato e codificá-lo no script:
   - célula **256×256**; grade 4 colunas × 5 linhas → PNG **1024×1280**;
   - linhas (estados, ordem fixa): `idle`, `falando`, `feliz`, `pensativo`, `surpreso`;
   - colunas (bocas, ordem fixa): `rest`, `open_a`, `rounded_o`, `wide_e`;
   - frame id `"${state}/${mouth}"`, ordem row-major;
   - metadados `sprite.json`: `{image, cellWidth, cellHeight, columns, rows, states[],
     mouths[], frames[{name,row,col,x,y}]}`.
3. Desenho procedural determinístico (sem random/timestamp): cabeça circular estilo flat,
   olhos fixos, sobrancelhas por estado (feliz arqueadas, pensativo uma inclinada, surpreso
   altas) e boca por viseme (rest = traço, open_a = elipse alta, rounded_o = círculo,
   wide_e = cápsula larga).
4. Emitir `remotion-kit/assets/sprite-placeholder.png` + `sprite.json`; smoke interno:
   reabrir o PNG e validar dimensões/grade contra o JSON (20 frames nomeados).
5. Criar `remotion-kit/assets/CONTRACT.md` documentando dimensões, nomes, ordem e a regra
   de drop-in: substituir o PNG mantendo dimensões/ordens, ou atualizar `sprite.json`
   junto — nada de caminho/geometry hardcoded nos consumidores.
6. Commitar PNG + JSON (permitidos: `.gitignore` cobre apenas wav/mp4/webm/mkv).

## Critérios de aceite

- [ ] `node remotion-kit/tools/generate-sprite.mjs` roda igual em Windows e Linux
- [ ] Execuções repetidas produzem bytes idênticos (determinístico)
- [ ] PNG 1024×1280 + `sprite.json` + `CONTRACT.md` commitados em `remotion-kit/assets/`
- [ ] Contrato documenta dimensões, nomes, ordem e regra de drop-in

## Verificação

```bash
npm run check
node remotion-kit/tools/generate-sprite.mjs && git status --porcelain remotion-kit/assets   # vazio = determinístico
```

## Notas

- D-17 é a decisão-mãe: consumidores leem sempre `sprite.json`, nunca assumem layout.
- pngjs escolhido para evitar deps nativas (canvas/sharp exigiriam build no Windows);
  qualidade visual é irrelevante aqui — o placeholder só precisa ser legível e estável.
- Mapeamento fino visemes→bocas é função pura nas S2-03/S3-04; este contrato de colunas é a
  fronteira entre os dois mundos.

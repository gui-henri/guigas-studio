---
id: S3-07
titulo: "Rig `<AvatarSprite>`: sheet, bocas por viseme, 5 estados, sync de áudio"
sprint: 3
prioridade: P0
depende_de: ["S3-04", "S3-06"]
estimativa_h: 2
status: done
---

# S3-07 — Rig `<AvatarSprite>` no Remotion

## Objetivo

Componente Remotion `<AvatarSprite>` que dá vida ao avatar: recorta o sprite sheet
(placeholder procedural da S0-13, contrato respeitado), anima a boca pelas formas A–H+X
do `avatar.timeline.json` (S3-04), troca corpo/expressão pelos estados, com escala e
posição parametrizáveis e sincronizado ao `<Audio>` do segmento.

## Contexto

- D-17: placeholder procedural 5 estados × ~4 bocas; o sprite desenhado entra depois por
  drop-in respeitando o contrato de sheet — o rig não pode saber nada do desenho.
- Contratos consumidos: `sprite.json` (S0-13: grade, mapa estado→linha, boca→coluna) e
  `AvatarTimeline` (proto S3-04 → tipos TS do codegen).
- Preview via `PlayerHost` (S3-06); o render final usa o MESMO componente (D-09) — nada
  de caminho alternativo "só funciona no preview".

## Pré-requisitos

- S3-04 e S3-06 com `status: done`. Fixture de timeline + sheet placeholder da S0-13
  copiados para `remotion-kit/fixtures/`.

## Passos

1. Seletores puros FORA do React: `selectMouthCue(cues, ms)` e `selectBodyState(states,
   ms)` com comportamento definido nas bordas (antes do 1º cue / após o último = clamp).
   Unit tests primeiro (vitest no pacote).
2. `<AvatarSprite>`: props `timeline`, `spriteSheetUrl`, `spriteMeta` (parse do
   `sprite.json`), `scale`, `position`; render via `<Img>` + `backgroundPosition`
   proporcional à célula — simples e suficiente para grid regular.
3. Frame → tempo: `ms = useCurrentFrame() * (1000 / fps)`. Nunca `setTimeout`/`Date.now`
   — preview e `renderMedia()` precisam ser determinísticos.
4. Cena composta `AvatarSegmentScene`: `<AbsoluteFill>` com `<AvatarSprite>` + `<Audio
   src={wavUrl}>` dentro de um `<Sequence>` — boca e áudio herdam o mesmo clock.
5. Mapeamento viseme→coluna lido do `sprite.json`; forma `X` (silêncio) cai na célula de
   boca fechada. Nenhum índice hardcoded no componente.
6. Parametrização de escala/posição com números simples (o compositor fullscreen↔overlay
   da S4-05 vai reusar isso).
7. Fixtures visuais: script npm `still:avatar` rodando `npx remotion still` em frames-
   chave (início, meio de fala, silêncio, troca de estado) sobre a timeline fixture;
   inspeção manual dos PNGs em `out/`.

**Convenções**: código em EN; docs em PT-BR.

## Critérios de aceite

- [x] Seletores puros com unit tests incluindo casos de borda (4 testes vitest no remotion-kit)
- [x] Boca acompanha a timeline e fecha em `X` nos silêncios (mapeamento A–H→colunas via sprite.json)
- [x] Troca de estado visível conforme `body_states`
- [x] Escala/posição parametrizadas (props; stills renderizados nos 4 frames-chave)
- [x] Áudio e boca compartilham o clock do Remotion (`useCurrentFrame` + `<Sequence>` + `<Audio>`) — determinístico por construção

## Verificação

```bash
npm run check
cd remotion-kit && npx vitest run
npm run still:avatar   # stills dos frames-chave definidos no passo 7
```

## Notas

- **Escolha registrada**: o rig consome uma `TimelineView` estrutural (campos do proto
  sem exigir a Message gerada) — fixtures JSON entram direto e o codegen TS satisfaz a
  interface; nenhum schema duplicado.
- **Escolha registrada**: mapeamento forma→coluna fixo (A/B→open_a, C/D/F/G→rounded_o\/
  wide_e, H/X→rest) lido SEMPRE via `sprite.json.mouths[]` — nada de índice hardcoded.
- Determinismo é lei no Remotion: qualquer leitura de relógio real quebra a paridade
  preview↔render. Aleatoriedade permitida só via `random(seed)` do Remotion.
- Sheet irregular (células de tamanhos diferentes) não está no contrato da S0-13: se o
  sprite real desafiar isso, atualize o contrato lá primeiro — o rig não se adapta.
- Não carregue WAV dentro do `<AvatarSprite>`: áudio é responsabilidade da cena
  (`<Audio>`); o sprite é mudo por definição.

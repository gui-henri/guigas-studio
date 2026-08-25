---
id: S2-04
titulo: "Avatar vivo em canvas reagindo ao estado detectado"
sprint: 2
prioridade: P1
depende_de: [S0-13, S2-03]
estimativa_h: 2
status: done
---

# S2-04 — Avatar vivo (preview em canvas)

## Objetivo

Componente `<LiveAvatar>` que desenha o sprite placeholder em canvas e troca de estado
em tempo real conforme o mapeamento da S2-03 — feedback visual imediato de que a
detecção facial está funcionando durante a gravação. Boca neutra: visemes existem só
no render final (SPEC §4.3).

## Contexto

Consome `remotion-kit/assets/sprite-placeholder.png` + `sprite.json` (contrato da
S0-13, D-17) e o tipo `SpriteState` da S2-03. Será embutido na página do teleprompter
(S2-06). É preview de monitoração — não participa do render Remotion (isso é o rig
`<AvatarSprite>` da S3-07).

## Pré-requisitos

- S0-13 `done` (sheet + `sprite.json` no formato do contrato) e S2-03 `done`.
- Frontend buildando (S0-09); nenhum asset novo a criar aqui.

## Passos

1. Utilitário `loadSpriteSheet()` em `frontend/src/recording/spriteSheet.ts`: lê o
   `sprite.json` (grid, dimensões de célula, mapa estado→linha) e pré-carrega a PNG
   via import estático do Vite (mesmos arquivos usados pelo remotion-kit).
2. Componente `<LiveAvatar state mirror scale>` em
   `frontend/src/components/LiveAvatar.tsx`: `<canvas>` com backing store 2× DPR e
   loop `requestAnimationFrame` que redesenha apenas quando célula/estado mudou.
3. Desenho: recorte da célula do estado corrente com **frame de boca fixo (índice 0)**
   — nenhuma animação de viseme aqui por decisão de escopo (SPEC §4.3).
4. Controles: `mirror` (ctx.translate + scale(-1,1), padrão ligado — as pessoas se
   espelham) e `scale` (240–720 px), expostos como props + sliders na rota de dev.
5. Modo demo: prop `demo` cicla os 5 estados a cada 800 ms para desenvolver sem
   webcam; desligado na página real.
6. Performance: estado chega por ref (`stateRef.current`), sem re-render do React por
   amostra; `cancelAnimationFrame` no unmount.

## Critérios de aceite

- [x] Troca de estado visível no mesmo frame da amostra (rAF lê stateRef, sem re-render React; validação visual fica p/ smoke com webcam)
- [x] Espelho liga/desliga sem distorcer; escala respeita os limites (240–720, sliders em /dev/avatar)
- [x] Modo demo percorre os 5 estados do contrato S0-13
- [x] Sem vazamentos: rAF cancelado no unmount; timer do demo limpo

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
npm run build -w frontend
# manual: npm run dev -w frontend → /dev/avatar com sliders de mirror/escala/demo
```

## Notas

- `imageSmoothingEnabled = false` mantém o placeholder nítido ao escalar.
- `sprite.json` é contrato compartilhado com `remotion-kit`: se a S0-13 mudar o layout,
  este loader e o rig da S3-07 quebram juntos — atualizar pelo contrato, nunca por hack.
- Não importar Remotion aqui (T-02 reserva Remotion para o `<Player>`); a PNG entra
  como asset estático comum do bundle.

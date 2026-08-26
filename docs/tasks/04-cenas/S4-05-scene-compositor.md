---
id: S4-05
titulo: "Compositor de cena: avatar protagonista ↔ visual técnico"
sprint: 4
prioridade: P0
depende_de: [S3-07, S4-02]
estimativa_h: 2
status: done
---

# S4-05 — Compositor de cena (SegmentComposition)

## Objetivo

Criar `<SegmentComposition>` em `remotion-kit/`: resolve `scene.type` → componente via
registry e aplica a regra de composição do SPEC §2 #4 — avatar PROTAGONISTA em
fullscreen quando narra; visual técnico entra como overlay/split somente nos trechos com
cena (layout parametrizado). Integra `<AvatarSprite>` + `<Audio>` + legendas opcionais.
A MESMA composição serve ao preview no dashboard e ao render final do runner.

## Contexto

Consumidores: cards da review cena a cena em `scenes_review` (S4-08, PlayerHost via T-02)
e o render long/short em `rendering` (S5-05, `renderMedia()` via T-03). O rig do avatar
vem da S3-07; os componentes de cena das S4-02..S4-04 entram pelo registry conforme
ficam prontos. Duração por segmento vem dos artefatos de voz (manifest da S2-09/timelines
da S3-04) — nunca estimada por caractere.

## Pré-requisitos

- S3-07 com `<AvatarSprite>` funcional (timeline, sheet, sync de áudio).
- S4-02 entregue (`code_typing` + `diff_view` no mínimo registráveis).
- Fixtures de timeline/avatar dos testes da S3-07 para desenvolvimento.

## Passos

1. Criar `remotion-kit/src/compositions/registry.ts`:
   `Record<SceneType, React.FC<ScenePropsOf<Type>>>` preenchido com os componentes já
   existentes; tipo ausente no registry = erro explícito na montagem (nunca tela vazia).
2. Criar `remotion-kit/src/compositions/SegmentComposition.tsx` com props:
   `{ segment, avatarTimeline, audioSrc, scene?, layout?: "fullscreen" | "split" |
   "overlay", showSubtitles? }`. Regras: `scene == null` → avatar fullscreen (ignora
   layout); `scene != null` → `"split"` (default, avatar ~40% à esquerda + painel do
   visual) ou `"overlay"` (avatar fullscreen com card flutuante do visual).
3. Resolver duração da sequência pela duração real do áudio do segmento (prop/metadata),
   dirigindo toda animação por `useCurrentFrame`.
4. Montar `<Audio src={audioSrc}>` sincronizado e `<AvatarSprite>` recebendo a timeline
   do segmento (visemes/estados da S3-04).
5. Se `showSubtitles`, montar o componente de legendas (S4-06); default OFF — burn-in é
   opcional (SPEC §4.6).
6. Testes unitários do resolver e do seletor de layout (cena null → fullscreen; split
   default; overlay explícito; tipo não registrado → erro) (D-18).

## Critérios de aceite

- [x] Segmento sem cena renderiza avatar fullscreen narrando (decisão #4; layout prop ignorado nesse caso)
- [x] Segmento com cena respeita `layout` sem tocar nos componentes visuais (split default ~40% avatar à esquerda; overlay card flutuante)
- [x] Trocar um componente no registry não exige mudança no compositor (override testado)
- [x] Legendas só renderizam com toggle ligado (showSubtitles default OFF; cue lookup por ms do frame — S4-06 substitui pelo componente dedicado)
- [x] Composição roda tanto no `<Player>` (SPA) quanto num `renderMedia()` futuro —
      só useCurrentFrame/useVideoConfig/Audio/AbsoluteFill; áudio via prop audioSrc

## Verificação

```bash
npm run check
npm run test -w remotion-kit -- src/compositions
```

## Notas

## Notas

- Cena inválida → card de erro explícito com issues de parseScene (nunca tela vazia);
  layout="fullscreen" + cena é rejeitado no seletor (o autor deve remover a cena).
- Aresta órfã/erros de schema aparecem no card — mesmo caminho que o observador Go usará.
- Abstrair a fonte do áudio atrás da prop `audioSrc`: `staticFile()` só existe dentro do
  bundle Remotion; no preview (S3-08/S4-08) a URL vem autenticada do server. Não chamar
  `staticFile` dentro do compositor.
- Overlay vs split parametrizado por prop explícita — sem heurística automática de "qual
  cena merece overlay"; decisão humana/agente fica no dado, não no código.
- Cuidado com `<Audio>` duplicado: o `<Player>` já toca áudio da composição; não adicionar
  player manual paralelo nos cards da S4-08.

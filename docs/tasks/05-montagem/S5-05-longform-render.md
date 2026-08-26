---
id: S5-05
titulo: "Render long-form 1080p16:9 no runner com progresso ao vivo"
sprint: 5
prioridade: P0
depende_de: [S4-08, S5-04]
estimativa_h: 2
status: done
---

# S5-05 — Render long-form 1080p16:9

## Objetivo

Stage `render_long` no runner: construir o bundle Remotion localmente (T-03), rodar
`renderMedia()` da composição `LongForm` em 1080p16:9 com todos os segmentos
(avatar + cenas + áudio concatenado + legendas EN opcional), reportando progresso
granular que chega ao dashboard via SSE (D-03).

## Contexto

SPEC §4.6 ("daemon local executa renderMedia(), ~15–40 min"); T-03 define bundle
local + `renderMedia()`. Consome os inputs sincronizados na S5-04 e as composições de
`remotion-kit/` (S3-06/S3-07/S4-05). Risco SPEC §9: **Remotion pinned** em versão exata
em todos os workspaces para evitar drift áudio/vídeo em renders longos.

## Pré-requisitos

- S4-08 e S5-04 `done`; ffmpeg/compositor do Remotion funcionando no Windows (S3-09).
- Versões Remotion idênticas em `frontend`, `remotion-kit`, `runner`.

## Passos

1. Fixar Remotion: em todos os workspaces, trocar por versão EXATA (sem `^`) de
   `remotion`, `@remotion/bundler`, `@remotion/renderer` — mesma versão everywhere.
   Commit do lockfile.
2. Runner: deps `@remotion/bundler` + `@remotion/renderer`; entry do bundle =
   `remotion-kit/src/index.ts` (Root com `LongForm` e `Short`).
3. `src/stages/bundle.ts`: `bundle({entryPoint, outDir: WORK_DIR/<slug>/bundle})`
   com webpack cache reutilizável entre jobs (`cacheDir` fixo em WORK_DIR).
4. `src/stages/render_long.ts`: montar inputProps a partir dos inputs baixados
   (`{scriptPath, audioDir, timelinesDir, spritePath, subtitlesPath, showSubtitles}`)
   validados com Zod no limite do Remotion (D-01); `selectComposition(LongForm)` →
   `renderMedia({composition, codec: 'h264', output: out/long.mp4, onProgress})`.
5. Progresso: mapear `onProgress.renderedFrames/totalFrames` → percent 0–100 e
   reportar como stage `render_long` com throttle ≤1 update/s; heartbeat continua paralelo.
6. Validar props/cenas antes de renderizar: falha de schema → `FailJob(retryable=false)`
   (dados ruins não melhoram com retry).
7. Teste manual guiado com vídeo fixture curto (~30 s): MP4 gerado, A/V sincronizado.

## Critérios de aceite

- [x] Remotion 4.0.517 EXATA em todos os workspaces (frontend/remotion-kit já pinados; runner ganhou @remotion/bundler+renderer exatas; @guigas/remotion-kit workspace dep)
- [x] Bundle construído no runner via @remotion/bundler com publicDir = WORK_DIR/<slug> (inputs viram raiz de staticFile) e cache webpack fixo
- [x] LongForm real: LongFormVideo costura segmentos em <Sequence> reusando a MESMA SegmentComposition do preview (áudio por sequência, legendas opcionais); renderMedia h264 → out/long.mp4 1920×1080
- [x] onProgress mapeado a percent com throttle por ponto inteiro → UpdateProgress → SSE JobProgress (D-03); heartbeat paralelo segue vivo
- [x] buildInputProps valida cenas com parseScene da gramática e timelines/áudio obrigatórios ANTES do render: violação → NonRetryableError → FailJob(retryable=false)

## Verificação

```bash
npm run check
npm ls remotion @remotion/bundler @remotion/renderer --workspaces
npm run build --workspaces --if-present
npm run dev -w runner   # job fixture: observar render_long até CompleteJob parcial
```

## Notas

## Notas

- Composição LongForm trocada de PlaceholderScene para LongFormVideo (mesmo id);
  calculateMetadata deriva a duração total da soma das timelines dos segmentos.
- Teste manual guiado (~30 s, A/V sincronizado) fica para a máquina real com o
  pipeline completo S5-06/S5-07 — registrado como pendência operacional.
- Não subir o bundle pro server nem baixar pronto: T-03 é explícito — bundle local,
  menos tráfego e nenhuma dependência de toolchain na VPS.
- Windows: usar caminhos absolutos nos inputProps; `webpackOverride` igual ao do
  frontend para o bundle refletir o preview aprovado (mesma fonte, S3-06).
- Se RAM estourar em renders longos: reduzir `concurrentTabs`/`jpegQuality` antes de
  mexer na resolução; baseline real fica na S5-12.

---
id: S5-08
titulo: "Trilha sonora com ducking sob narração (P2)"
sprint: 5
prioridade: P2
depende_de: [S5-05]
estimativa_h: 2
status: todo
---

# S5-08 — Trilha sonora e mixagem

## Objetivo

Trilha de fundo opcional nos renders: pasta de faixas licença-livre no repo, seleção
por vídeo via campo do `script.json` (com default sensato) e mixagem com ducking sob
a narração via filtro ffmpeg no pipeline do runner; volume configurável.

## Contexto

SPEC §4.6 ("+ trilha"); DECISIONS §3 registra trilha como P2 que pode voltar ao backlog
sem bloquear a v1. Pluga-se como stage pré-render no runner (entre `sync` e `bundle`),
antes da S5-06 consumir o áudio já mixado. Não muda composições — só o áudio de entrada.

## Pré-requisitos

- S5-05 `done`; ffmpeg no PATH do runner Windows (`winget install Gyan.FFmpeg`).
- Faixas escolhidas e licenças verificadas (crédito exigido? registrar em `LICENSE.md`).

## Passos

1. Criar `assets/music/` no repo com 2–3 faixas `.mp3` licença-livre (ex.: Pixabay/
   incompetech) ≤5 MB cada + `assets/music/LICENSE.md` com origem/licença de cada uma.
2. Estender `StudioScript` (S1-02, proto + JSON Schema) com campo opcional
   `soundtrack {track string, volume double}`; retrocompatível: ausente = sem trilha.
   Regenerar codegen.
3. Server: incluir a faixa escolhida (ou nenhuma) no manifest de inputs do job (S5-04)
   — trilha é servida como artefato normal, com sha256.
4. Runner `src/stages/soundtrack.ts`: se `soundtrack.track` presente e arquivo baixado,
   gerar `out/mixed.wav`: narração concatenada + música com
   `-filter_complex "[1:a]volume=<vol>,aloop=...[m];[m][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=50:release=500[out]"`,
   trim/loop da música para a duração da narração e loudnorm final.
5. Pipeline: quando `mixed.wav` existir, os stages de render usam-no como faixa de
   áudio única nas inputProps; senão comportamento atual (sem regressão).
6. Volume default documentado (ex. 0.15) quando campo presente sem `volume`;
   clampar `volume` a [0.05, 0.5] no runner (trilha nunca sopra a voz).

## Critérios de aceite

- [ ] Vídeo com `soundtrack` definido sai com música duckando sob a narração (audível:
  música abaixa quando a voz fala)
- [ ] Vídeo sem `soundtrack` renderiza idêntico ao fluxo anterior (sem regressão)
- [ ] Faixas commitadas ≤5 MB com licença documentada em `LICENSE.md`
- [ ] Falha na mixagem (ffmpeg ausente/arquivo ruim) vira `FailJob(retryable=false)` com motivo claro

## Verificação

```bash
npm run check
npm run build --workspaces --if-present
ffmpeg -version   # no Windows onde o runner roda
npm run dev -w runner   # fixture COM e SEM soundtrack; ouvir out/long.mp4
```

## Notas

- Mixagem fora do Remotion (ffmpeg sidechaincompress) é a opção mais simples alinhada:
  composições continuam recebendo um único áudio e nada de lógica de ganho dentro das
  sequências (T-03 preservado). Mix dinâmico dentro do Remotion é backlog.
- Ducking precisa da narração como sidechain: manter ordem `[1:a][0:a]` correta —
  invertida, a música ducka a VOZ (erro clássico, inaudível no smoke curto).
- Se o ffmpeg do PATH divergir entre máquinas, fixar versão mínima no README do runner.

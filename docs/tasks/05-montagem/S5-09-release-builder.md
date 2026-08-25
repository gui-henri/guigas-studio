---
id: S5-09
titulo: "Release builder: releases/<slug>/ completo no server"
sprint: 5
prioridade: P0
depende_de: [S5-07]
estimativa_h: 2
status: todo
---

# S5-09 — Release builder

## Objetivo

Serviço no backend que, acionado pela aprovação do corte final, gera
`releases/<slug>/` completo conforme o workspace canônico: `youtube/`
(video.mp4, thumbnail.jpg via still do hook, metadata.json com título+descrição
linkando o post), `shorts/short-N/`, `x/thread.md`, `linkedin/post.md`,
`instagram/caption.txt` — SRT EN junto de cada vídeo.

## Contexto

SPEC §4.7; workspace canônico no ROADMAP (`releases/youtube|shorts|x|linkedin|instagram`).
Consome renders validados (S5-07), textos de `script.social` e URL do post de origem
(watcher S0-16). Binários são copiados (gitignored — D-11); textos/SRT/metadata são
commitados no git do workspace pelo server (T-07). Estado permanece `final_review`;
`released` só vem do checklist (S5-11).

## Pré-requisitos

- S5-07 `done`; `ApproveFinalCut` existindo como stub.
- ffmpeg disponível na imagem da api (extrair 1 frame é barato p/ a VPS).

## Passos

1. Dockerfile/compose da api: incluir ffmpeg na imagem (apt pkg, camada pequena).
2. `proto`: transformar `ApproveFinalCut` em RPC real (retorna resumo dos paths gerados).
3. `backend/internal/services/release_builder.go`, idempotente (rodar 2× sobrescreve):
   - `youtube/video.mp4` ← cópia de `renders/long.mp4`;
   - `youtube/thumbnail.jpg` ← still do hook: `ffmpeg -ss <hook_t> -i long.mp4 -frames:v 1`
     (timestamp do hook vindo do script/timeline);
   - `youtube/metadata.json` ← título + descrição do script com link para o post original;
   - `shorts/short-N/{video.mp4,copy.json}` para cada short aprovado;
   - `x/thread.md` ← `script.social.x` como thread numerada `1/n`;
   - `linkedin/post.md`, `instagram/caption.txt` ← campos correspondentes de `script.social`.
4. SRT EN: conversor `subtitles.en.json → .srt` (função pura + unit test, D-18);
   gravar `youtube/video.srt` e `shorts/short-N/video.srt`.
5. Semear linhas do checklist de lançamento em PG (uma por plataforma/short) —
   consumidas pela S5-11.
6. Git do workspace (T-07): commit dos arquivos texto gerados (binários ficam de fora
   via .gitignore já existente); mensagem `release(<slug>): build v1`.
7. Falhas (ffmpeg ausente, `script.social` incompleto) → vídeo `blocked` com motivo
   estruturado; builder re-executável após corrigir.

## Critérios de aceite

- [ ] Aprovar o corte gera TODOS os diretórios/arquivos do layout canônico
- [ ] Cada MP4 tem seu `.srt` EN ao lado; thumbnail.jpg é um frame real do hook
- [ ] metadata.json contém link clicável para o post de origem
- [ ] Textos/SRT/metadata commitados no git do workspace; binários ignorados (T-07/D-11)
- [ ] Builder idempotente; falha registra `blocked` com motivo e é retomável pela UI

## Verificação

```bash
npm run check
cd backend && go test ./internal/services/ -run 'Release|SRT'
docker compose build api && docker compose up -d api
# aprovar corte na UI e conferir:
ls /data/videos/<slug>/releases/{youtube,shorts,x,linkedin,instagram}
cd /data/videos/<slug> && git log --oneline -1
```

## Notas

- Ainda não existe API de auto-publish (SPEC §8 backlog): o builder só prepara pacotes
  prontos para upload manual — escopo consciente.
- Extrair thumbnail na VPS com ffmpeg custa ~1 frame; alternativa renderStill no runner
  (upload como artifact) só se ffmpeg pesar — não antecipe.
- Não criar estados novos na máquina: `final_review → released` continua sendo exclusivo
  do checklist completo (S5-11).

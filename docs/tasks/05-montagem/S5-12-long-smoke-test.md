---
id: S5-12
titulo: "Smoke test de render longo (~12 min) com baseline"
sprint: 5
prioridade: P1
depende_de: [S5-05]
estimativa_h: 2
status: todo
---

# S5-12 — Smoke de render longo (~12 min)

## Objetivo

Render de ~12 minutos com conteúdo sintético para validar, ANTES do vídeo real:
sync áudio/vídeo em duração longa (drift), tempo total dentro da janela 15–40 min do
SPEC §4.6 e RAM do processo node no Windows — registrando um baseline de performance
neste documento (risco SPEC §9).

## Contexto

Mitigação canônica do SPEC §9: "Drift áudio/vídeo em renders longos → Remotion pinned;
smoke test de 12 min antes do vídeo real". Exerciza o pipeline real (fila → runner →
render) sem depender de gravação/cenas humanas; Remotion já pinned na S5-05. Roda na
máquina local Windows onde o runner vive (D-13).

## Pré-requisitos

- S5-05 `done` (e idealmente S5-06/S5-07 para o fluxo completo).
- Server dev no ar (compose) + runner configurado com `RUNNER_TOKEN`.
- ffmpeg no PATH (análise de frames/áudio).

## Passos

1. Criar `tools/gen-smoke-fixture.mjs` (node script commitado): gera workspace
   sintético `videos/smoke-long/` no server dev —
   - `script.json` válido com N segmentos totalizando ~720 s e 2 marcas `[SHORT#n]`;
   - narração fake por segmento: WAV senoidal 440 Hz com **beep 1 kHz a cada 60 s**
     (gerado no mesmo script, determinístico);
   - timelines/blendshapes sintéticos determinísticos + cenas mínimas válidas
     (gramática S4-01) com **timecode queimado** via prop exclusiva da fixture.
2. Enfileirar o job real (aprovar cenas pela UI ou RPC) e deixar o runner consumir.
3. Medir e anotar: tempo total por stage (sync/bundle/render_long/shorts/upload),
   tempo fim-a-fim; comparar com a janela 15–40 min (SPEC §4.6).
4. RAM do runner: amostrar working set do processo node a cada 5 s durante o render
   (PowerShell `Get-Process node` loop no próprio script de medição) — pico e média.
5. Drift A/V: extrair frames nos instantes dos beeps (`ffmpeg -ss`) e conferir se o
   timecode queimado no frame bate com a posição esperada do beep no waveform
   (`ffmpeg -i out/long.mp4 -af astats` / inspeção); tolerância alvo <100 ms.
6. Registrar TODOS os números numa seção `## Baseline (preenchido na execução)`
   adicionada AO FINAL deste arquivo + commit (`docs(S5-12): baseline smoke 12min`).
7. Se drift/tempo estourar: registrar no baseline e marcar `blocked` com dados —
   ajustes de performance são tarefa própria, não improviso aqui.

## Critérios de aceite

- [ ] Job completo termina sem erro humano no meio (fila→runner→upload→final_review)
- [ ] Drift áudio/vídeo <100 ms verificado nos beeps de 60 s
- [ ] Tempo fim-a-fim dentro da janela 15–40 min (ou desvio documentado)
- [ ] Pico de RAM do node registrado (número explícito em MB/GB)
- [ ] Baseline commitado neste doc; fixture reproduzível com 1 comando

## Verificação

```bash
npm run check
node tools/gen-smoke-fixture.mjs --minutes 12
npm run dev -w runner   # aguardar job completo; depois conferir baseline abaixo
ffprobe -v error -show_entries format=duration -of csv out/long.mp4   # ~720 s
```

## Notas

- Beeps periódicos + timecode queimado transformam "parece sincronizado" em medida
  objetiva — não pule essa parte achando o olhômetro suficiente para 12 min.
- Rodar com o notebook na tomada e sem throttling óbvio; anotar no baseline qualquer
  condição atípica (outros apps pesados abertos).
- Se o tempo estourar 40 min: candidatos são `concurrentTabs`, jpegQuality e cache de
  bundle — medir um ajuste por vez e atualizar o baseline.

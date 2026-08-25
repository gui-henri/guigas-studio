---
id: S2-09
titulo: "Junção: concat dos takes aprovados + manifest → voice_processing"
sprint: 2
prioridade: P0
depende_de: [S2-08]
estimativa_h: 2
status: todo
---

# S2-09 — Concat dos takes + manifest de gravação

## Objetivo

Job interno do server que, ao completar o conjunto, concatena os WAVs na ordem dos
segments do `script.json`, gera `timelines/recording.manifest.json` com timestamps por
segmento e promove `recording → voice_processing` (gatilho canônico: "concat
concluída").

## Contexto

Dispara como hook pós-upload (S2-01), na própria VPS — fila de jobs ainda não existe
(isso é S5-01), então roda em goroutine com log + SSE. O manifest é texto versionável
no workspace git dos vídeos (T-07: server commita por transição validada); os WAVs
seguem gitignored (D-11). Assume o formato fixo 48 kHz/mono/16-bit garantido pela S2-05.

## Pré-requisitos

- S2-08 `done`; módulo `videostate` (S0-15) e hub SSE (S1-05) disponíveis.

## Passos

1. Criar `backend/internal/services/recording`: `ConcatService.Run(slug)` idempotente
   por slug (lock em memória + só age com status == `recording`), chamado após
   `UpsertTake` em goroutine (a resposta do upload não espera).
2. Completude: todo `segment_id` do `script.json` tem take `kind=audio` **e**
   `kind=blendshapes`; caso negativo, no-op silencioso (log debug) — ainda há o que
   gravar.
3. Concat WAV puro em Go (decisão registrada nas Notas): validar headers fmt idênticos
   (PCM 16-bit/48 kHz/mono), somar tamanhos de `data`, escrever cabeçalho RIFF novo em
   `audio/full.wav` e copiar os payloads PCM na ordem do script.
4. Gerar `timelines/recording.manifest.json`:
   ```jsonc
   {
     "version": 1,
     "generated_at": "2026-08-25T12:00:00Z",
     "sample_rate": 48000,
     "total_duration_ms": 731000,
     "segments": [{ "segment_id": "seg-01", "index": 0, "start_ms": 0,
                    "duration_ms": 182500, "take_sha256": "…" }]
   }
   ```
   Duração lida do próprio WAV (não confiar no `duration_ms` do cliente).
5. Promover `recording → voice_processing` via módulo de estados + commit git do
   workspace com o manifest (texto; binários ignorados — T-07) + evento SSE.
6. Qualquer falha (header divergente, disco cheio, erro de DB) → `blocked` com motivo
   estruturado (comportamento padrão da máquina de estados) + evento SSE.
7. Testes com fixtures: 3 WAVs enviados fora de ordem → concat na ordem do script;
   soma do manifesto coerente; segmento faltante → no-op; segunda execução → sem
   efeito colateral.

## Critérios de aceite

- [ ] `full.wav` reproduz os segmentos na ordem do script, independente da ordem de upload
- [ ] Manifest com `start_ms`/`duration_ms` corretos e `take_sha256` casando com o PG
- [ ] Transição disparada exatamente uma vez; reexecução é no-op seguro
- [ ] Regravagem de um segmento enquanto `recording` regenera tudo na conclusão seguinte

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
cd backend && go test ./internal/services/recording/... -run TestConcat
```

## Notas

- Decisão: concat WAV puro em vez de ffmpeg — os takes são homogêneos (encoder próprio
  da S2-05, formato fixo), então concatenar é copiar bytes de PCM; evita depender do
  ffmpeg na imagem da VPS. ffmpeg só entra se a S5-08 (trilha/mixagem) exigir.
- `audio/full.wav` estende a árvore canônica do ROADMAP com um derivado dentro de
  `audio/` (gitignored como o resto); pode ser regenerado sob demanda se descartado.
- Reabrir gravação depois de `voice_processing` fica fora da v1: o caminho é tratar
  como retomada via `blocked`/reset manual do vídeo — sem atalho escondido na UI.

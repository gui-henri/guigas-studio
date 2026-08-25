---
id: S3-01
titulo: "Cliente Gemini Flash Lite: transcrição áudio→texto com timestamps"
sprint: 3
prioridade: P0
depende_de: ["S2-09"]
estimativa_h: 2
status: done
---

# S3-01 — Cliente Gemini Flash Lite (transcrição)

## Objetivo

Cliente Gemini API no backend Go que envia o WAV de um segmento gravado e devolve a
transcrição literal com timestamps por palavra. É a matéria-prima dos word timings (S3-02)
e das legendas EN (S3-05) — o primeiro passo do pipeline que roda enquanto o vídeo está em
`voice_processing`.

## Contexto

- SPEC §2 #23: Gemini Flash Lite **substitui whisper.cpp**; a voz narrada ir pra API é
  decisão consciente e documentada (tensão com o post de ZDR anotada em SPEC §9; fallback
  local 100% é backlog, SPEC §8 #7 — daí a abstração de provider abaixo).
- SPEC §2 #17 (Flash Lite = cérebro de volume) e §4.4 (transcrição no processamento de voz).
- Credencial Gemini já existe (D-12) — aqui é só configuração, não aquisição.
- Backend Go (D-01). Cliente HTTP em `backend/internal/gemini` (reutilizado pela S3-05);
  interface de domínio em `backend/internal/transcription`.
- Entrada: `videos/<slug>/audio/<segment-id>.wav` produzidos pela junção (S2-09).

## Pré-requisitos

- S2-09 com `status: done` (manifest de timestamps por segmento existe).
- `GEMINI_API_KEY` no ambiente (adicionar ao `.env.example`; valor real só local/VPS).
- go ≥ 1.22.

## Passos

1. Criar `backend/internal/transcription` com a interface de domínio:
   ```go
   type Word struct { Text string; StartMs, EndMs int }
   type Transcriber interface {
       Transcribe(ctx context.Context, wavPath string) ([]Word, error)
   }
   ```
   A abstração existe para o futuro provider local (backlog) plugar sem tocar callers.
2. Criar `backend/internal/gemini`: cliente REST do `generativelanguage.googleapis.com`
   (GenerateContent), WAV como `inlineData` (base64) + instrução de responder JSON
   `{"words":[{"text","start_ms","end_ms"}]}`; parse tipado da resposta.
3. Config via env: `GEMINI_API_KEY` e `GEMINI_MODEL` (default = variante Flash Lite
   vigente na execução); timeout por request configurável.
4. Retry com backoff exponencial (3 tentativas) apenas para 429/5xx/timeout; erro 4xx de
   payload falha rápido (retry não conserta request inválido).
5. Logar custo por chamada a partir de `usageMetadata` (tokens de prompt/resposta) no slog.
6. Testes com fixture de resposta + `httptest.Server` simulando o upstream: caso feliz,
   429 → retry → sucesso, e esgotamento das tentativas. Zero chamada real em CI (D-15/D-18).

**Convenções**: código/identificadores/comentários em EN; docs em PT-BR.

## Critérios de aceite

- [x] `Transcriber` implementada pelo cliente Gemini sem vazar detalhes HTTP p/ callers
- [x] Retry/backoff (429→sucesso, 500 esgota, 4xx falha rápido) cobertos por testes determinísticos
- [x] Custo (tokens) logado estruturadamente a cada chamada (`gemini.usage`)
- [x] `GEMINI_API_KEY` presente no `.env.example` (sem valor) e lida via config (+ GEMINI_MODEL/GEMINI_TIMEOUT)
- [x] Suíte roda 100% offline (fixtures + httptest, 5 testes)

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
go test ./backend/internal/gemini/... ./backend/internal/transcription/... -v
```

## Notas

- WAV vai inteiro por request: segmentos são curtos (dezenas de segundos), folgado no
  limite de payload inline. Se um dia estourar, paginar por chunks — não otimizar agora.
- Peça SOMENTE a transcrição (sem resumo/tradução no mesmo request) — cada consumo de LLM
  tem sua tarefa; tradução é a S3-05.
- Se o formato de resposta variar entre versões do modelo, endureça prompt e parse e
  registre a divergência aqui; nunca "corrija na marra" no caller.

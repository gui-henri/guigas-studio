---
id: S1-05
titulo: "Hub SSE: broker + endpoint autenticado + useStudioEvents"
sprint: 1
prioridade: P0
depende_de: [S0-08]
estimativa_h: 2
status: done
---

# S1-05 — Hub SSE (tempo real server→client)

## Objetivo

Dar tempo real ao dashboard (D-03, D-19): broker SSE em memória no server com tópicos
`global` e `video:<id>`, endpoint GET autenticado por Bearer, envelope de evento tipado
compartilhado Go↔TS via proto e o hook `useStudioEvents` com reconexão e invalidação
automática do TanStack Query.

## Contexto

D-03 fixa SSE (server→client) com mutations RPC unary; o cliente usa **fetch-based SSE**
porque o `EventSource` nativo não envia headers de autorização. Produtores de eventos:
watcher (`watcher.post_found`, S0-16), observador (`script.validated`, S1-03) e
transições de status (`video.status_changed`, S1-04). Consumidores: fila de cards
(S0-12) e páginas de revisão (S1-06/S1-07).

## Pré-requisitos

- S0-08 `done` (JWT + interceptor); helper de verificação de token reutilizável em
  `backend/internal/middleware/`.
- TanStack Query configurado no scaffold (S0-09).

## Passos

1. Criar `proto/app/studio/v1/events.proto`: `StudioEvent` com `oneof event`
   (`VideoStatusChanged{video_id, slug, from_status, to_status}`,
   `ScriptValidated{video_id, slug, valid}`, `WatcherPostFound{slug}`); rodar
   `npm run gen` — stubs TS garantem tipagem única sem duplicar tipos à mão.
2. Criar `backend/internal/events/hub.go`: broker em memória (`Subscribe(topics...)
   (<-chan StudioEvent, cancel func())`, `Publish(topic, StudioEvent)`); canal por
   conexão com buffer pequeno e drop + log para consumidor lento (produção nunca bloqueia).
3. Endpoint HTTP puro `GET /api/events?topic=global|video:<id>` no mesmo mux do Connect:
   auth Bearer via helper JWT do middleware (S0-08), resposta `text/event-stream`,
   flush a cada evento e heartbeat `:ping` (~25 s).
4. Ligar produtores: wrapper de transição publica `video.status_changed` (usado pelos
   handlers da S1-04 e pelo watcher), observador troca o Publisher noop da S1-03 pela
   implementação real do hub.
5. Criar `frontend/src/lib/sse.ts`: leitura via `fetch` + `ReadableStream`
   (Authorization header — D-03), parser de linhas `data:`/heartbeat, reconexão com
   backoff exponencial + jitter; aborta no unmount via `AbortController`.
6. Criar `frontend/src/hooks/useStudioEvents.ts`: assina tópico `global`; mapeia evento →
   invalidação (`video.status_changed` → `['videos']` e `['video', id]`;
   `script.validated`/`watcher.post_found` → `['videos']`), montado uma vez no shell.
7. Caddy: garantir streaming sem buffer (`flush_interval -1` no bloco `reverse_proxy`)
   nos compose dev/prod (S0-05/S0-05-prod).
8. Testes (D-18): unit test do hub (sub/publish/cancel/consumidor lento) e smoke manual
   documentado abaixo.

## Critérios de aceite

- [x] `curl -N` com Bearer recebe heartbeat e eventos em protojson; sem token → 401 (verificado ao vivo)
- [x] Transição de status aparece na UI de outro browser em < 2 s (invalidação automática) *(hook implementado; validação visual multi-browser fica para sessão real)* 
- [x] Reconexão automática após derrubar/subir o server (backoff exponencial + jitter no cliente)
- [x] Envelope consumido no frontend vem dos stubs de `events.proto` (sem tipos manuais)
- [x] Heartbeat presente (`: ping` ~25 s, observado no stream real)

## Verificação

```bash
npm run check
cd backend && go test ./internal/events/...
TOKEN=$(curl -s ... | jq -r .token)   # login via RPC da S0-07
curl -N -H "Authorization: Bearer $TOKEN" "http://localhost:8080/api/events?topic=global"
```

## Notas

- SSE é one-way: progresso do render continua chegando por aqui; comandos seguem unary
  RPC (D-03/D-10). Não invente canal client→server no stream.
- Sem `flush_interval -1`, o Caddy bufferiza e os eventos só saem em lote — sintoma
  clássico é "funciona no curl, não funciona atrás do proxy".
- Use uma única conexão global por página (não uma por card): HTTP/1.1 limita ~6
  conexões por origem; atrás do h2c/Caddy HTTP/2 isso relaxa, mas não abuse.
- Se um dia precisar de múltiplas instâncias da api, este broker em memória é o primeiro
  candidato a virar Redis pub/sub — anote, não implemente (escopo v1).

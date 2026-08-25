---
id: S0-16
titulo: "Watcher RSS núcleo: poll + parse + dedup + registro new"
sprint: 0
prioridade: P0
depende_de: ["S0-06"]
estimativa_h: 2
status: done
---

# S0-16 — Watcher RSS núcleo

## Objetivo

O gatilho de todo o pipeline (SPEC §4.1): poller RSS na VPS com intervalo configurável
(`RSS_URL`, `RSS_POLL_INTERVAL`), parse XML com stdlib, dedup por GUID em `rss_items` e,
ao detectar post novo, linha em `videos` com status `new` + log estruturado.

## Contexto

Primeiro estágio da máquina de estados: o watcher **nasce** vídeos direto em `new`
(estado inicial — não passa por `Transition`). Integração com SSE/eventos na UI fica para
a S1-05. `RSS_URL` já existe (D-12); roda dentro da api (goroutine), sem processo novo.

## Pré-requisitos

- S0-06 done (pool + migrações + queries funcionando).

## Passos

1. Migração `0004_rss_items.up.sql`: `rss_items(guid text PRIMARY KEY, video_id uuid NULL
   REFERENCES videos(id), seen_at timestamptz NOT NULL DEFAULT now())`; query
   `InsertRssItem :execrows ... ON CONFLICT (guid) DO NOTHING`.
2. Criar `internal/watcher/rss.go`: `Watcher{queries, cfg, logger}` com `Run(ctx)` — ticker
   de `time.ParseDuration(RSS_POLL_INTERVAL)` (default 30m), fetch de `RSS_URL` com timeout
   15 s e parse via `encoding/xml` (structs rss/channel/item: guid, title, link, pubDate).
3. Baseline: na primeira poll bem-sucedida (rss_items vazio), marcar todos os GUIDs atuais
   como vistos **sem** criar vídeos — evita enxurrada no boot/backlog histórico.
4. Item novo: slugify do link/título (`internal/watcher/slug.go`, ascii lowercase
   hifenizado) → `CreateVideo` com status `new`, título e source_url; preencher
   `rss_items.video_id`; log estruturado `watcher.rss.new_item {guid, slug, title}`.
5. Robustez: item sem GUID → skip com warn (GUID é a chave de dedup); fetch/parse falhando →
   log error e continua o loop (feed ruim nunca mata o watcher).
6. Ligar no `main.go`: `go watcher.Run(serverCtx)` após pool+migrações; cancelamento pelo
   shutdown existente.
7. Testes com fixture `testdata/feed.xml` servida por `httptest` e PG de teste
   (`STUDIO_TEST_DATABASE_URL`): 1ª execução = baseline 0 vídeos; feed com item extra →
   1 vídeo em `new`; re-poll idêntica → 0 novos (D-18).

## Critérios de aceite

- [x] Post novo → exatamente 1 linha em `videos` com status `new` + log estruturado
- [x] Re-poll do mesmo feed não duplica nada (dedup por GUID)
- [x] Intervalo configurável via `RSS_POLL_INTERVAL` (formato duração Go, ex.: "30m")
- [x] Watcher sobrevive a feed indisponível/malformado (loga e tenta de novo)
- [x] Testes com fixture verdes contra PG de teste

## Verificação

```bash
npm run check
docker compose up -d postgres
cd backend && STUDIO_TEST_DATABASE_URL="postgres://guigas:senha@localhost:5432/guigas_studio?sslmode=disable" go test ./internal/watcher/...
```

## Notas

- Saída do contrato desta tarefa: linha em `videos` + log estruturado; badge/SSE na UI é a
  S1-05 que consome isso.
- Datas de feed variam (RFC822/RFC1123) e não são confiáveis para ordenar novidade — o GUID
  é a única verdade de "é novo".
- Se nenhum vídeo aparecer num feed real, conferir ordem de diagnóstico: watcher rodando
  (log de poll) → GUID mudou entre polls? → dedup não marcou antes? Baseline só vale a
  primeira execução da vida do banco.

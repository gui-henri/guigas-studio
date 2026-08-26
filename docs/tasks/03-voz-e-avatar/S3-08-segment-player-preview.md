---
id: S3-08
titulo: "Preview por segmento no dashboard: PlayerHost + áudio real + timeline"
sprint: 3
prioridade: P0
depende_de: ["S3-07"]
estimativa_h: 2
status: done
---

# S3-08 — Preview por segmento no dashboard

## Objetivo

Na página do vídeo, aba de voz com preview por segmento: `PlayerHost` tocando o take
aprovado (áudio real) junto do avatar animado pela timeline, com play/pause/seek. É a
checagem humana da voz antes de avançar às cenas — fecha o laço
`voice_processing → scenes_pending` com confiança visual.

## Contexto

- T-02: o `<Player>` roda no bundle da SPA via `remotion-kit` (S3-06/S3-07).
- Disponibilidade dos artefatos chega em tempo real via SSE (D-03, hub da S1-05); estado
  do vídeo vem da listagem existente (S0-12).
- Os artefatos (WAV/timelines/assets) estão no disco da VPS (T-07) e NÃO são públicos:
  precisa de download autenticado — espelho de leitura do upload chunked (T-04).

## Pré-requisitos

- S3-07 com `status: done`. JWT funcionando no dashboard (S0-08).

## Passos

1. Endpoint HTTP GET autenticado no backend (mesmo mux/padrão do upload T-04):
   `/v1/videos/{videoId}/artifacts/{path...}` — streaming direto do disco com allowlist
   de prefixos (`audio/*.wav`, `timelines/*.json`, `assets/*`); Bearer obrigatório.
2. Sanitizar `path`: recusar `..`, caminhos absolutos e extensões fora da allowlist;
   teste automatizado de path traversal obrigatório.
3. Hook `useSegmentAssets(videoId, segmentId)`: fetch com header Authorization → Blob →
   object URLs para WAV + timeline JSON; `revokeObjectURL` no cleanup/unmount.
4. Aba "Voz" na página do vídeo: lista de segmentos (id, beat, duração, ✓/✗ timeline)
   e o player do segmento selecionado usando os controles nativos do `@remotion/player`.
5. Estado vazio: durante `voice_processing`, exibir progresso por segmento e atualizar
   via `useStudioEvents` (S1-05) conforme as timelines ficam prontas — sem refresh manual.
6. Component test leve (vitest): render da aba com fixtures mockadas + guardas (segmento
   sem timeline ⇒ player não aparece, mensagem de estado vazio).

**Convenções**: código em EN; docs em PT-BR.

## Critérios de aceite

- [x] Download sem Bearer falha 401; com Bearer streama o arquivo
- [x] Path traversal e extensão fora da allowlist ⇒ rejeitados (unit do sanitizador + matriz HTTP; mux normaliza `..` a montante → 404)
- [x] Preview toca áudio + avatar sincronizados (clock Remotion); seek via controles nativos do Player
- [x] Lista reflete chegada de timelines em tempo real (SSE useStudioEvents + invalidação)
- [x] Sem timeline, UI mostra estado vazio (2 testes de componente: vazio e com player mockado)

## Verificação

```bash
npm run check
cd frontend && npx vitest run
# E2E manual: docker compose up (S0-05), abrir um vídeo em voice_processing,
# conferir preview de um segmento com take + timeline reais
```

## Notas

- Segmentos são curtos (~30–60 s): blob em memória é ok; NÃO pré-carregue o vídeo inteiro.
- Refazer take muda os bytes: invalide object URLs a cada evento SSE relevante — cache
  agressivo aqui exibe o fantasma do take antigo.
- Este preview é de VOZ; o review de cenas (S4-08) reusa `PlayerHost` com outra
  composição — não acople esta aba ao catálogo de cenas.

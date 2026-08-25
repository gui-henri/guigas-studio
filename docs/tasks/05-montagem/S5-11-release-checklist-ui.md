---
id: S5-11
titulo: "Checklist de lançamento na UI → released"
sprint: 5
prioridade: P1
depende_de: [S5-09]
estimativa_h: 2
status: todo
---

# S5-11 — Checklist de lançamento na UI

## Objetivo

Card de checklist de lançamento no dashboard: um item por plataforma (youtube, cada
short, x, linkedin, instagram) com link/caminho pronto para download do pacote e
checkbox "publicado" manual; ao marcar todos, o vídeo transiciona
`final_review → released` — fechando a máquina de estados (SPEC §7).

## Contexto

SPEC §4.7 ("checklist na UI marca o que já foi publicado à mão"); itens são semeados
pelo release builder (S5-09) em PG (D-02). Gatilho canônico de `released` =
"checklist completo pela UI". Publicação é manual na v1 (auto-publish é backlog §8).
Nota: ROADMAP cita o gatilho tanto em S5-10 quanto S5-11 — a implementação vive aqui;
a página da S5-10 apenas navega/acompanha.

## Pré-requisitos

- S5-09 `done` (linhas do checklist semeadas + releases gerados).
- Usuário autenticado (JWT) — escrita só para humanos, nunca `RUNNER_TOKEN` (S5-02).

## Passos

1. Migration `NNNN_release_checklist.sql`: tabela com `video_id`, `item_key`
   (`youtube|shorts/short-N|x|linkedin|instagram`), `label`, `download_path`,
   `published bool default false`, `published_at timestamptz`;
   unique `(video_id, item_key)`; upsert idempotente vindo do builder.
2. Queries sqlc (`GetReleaseChecklist`, `SetChecklistItemPublished`) +
   `sqlc generate`.
3. RPCs em VideoService: `GetReleaseChecklist(video_id)` e
   `SetChecklistItemPublished(video_id, item_key, published)`.
4. Regra de conclusão no service: após cada update, se TODOS os itens do vídeo estão
   `published` → `videostate.Transition(video, "released")` na mesma transação +
   evento SSE; desmarcar um item NÃO volta estado (released é terminal na v1 —
   transição inversa não existe; usar `blocked`+retomada se precisar reabrir).
5. Unit test da regra all-published→released e do caso parcial (D-18).
6. UI: card "Lançamento" na página do vídeo (visível em `final_review`/`released`)
   listando itens com: label da plataforma, link de download do pacote (endpoint de
   mídia autenticado — baixa mp4/srt/metadata) e checkbox persistente.
7. Feedback: badge de progresso "3/5 publicados"; ao completar, card comemora e o
   status global vira `released` via SSE.

## Critérios de aceite

- [ ] Itens aparecem 1:1 com os diretórios gerados pelo builder (inclui shorts dinâmicos)
- [ ] Link de download baixa o arquivo correto autenticado
- [ ] Marcar todos → vídeo `released`; marcar parcialmente → nada muda de estado
- [ ] Checkbox sobrevive a reload (persistido em PG)
- [ ] Unit test cobre conclusão e caso parcial (D-18)

## Verificação

```bash
npm run check
cd backend && go test ./internal/services/ -run 'Checklist'
# manual guiado: marcar itens até concluir e ver released no dashboard
```

## Notas

- `released` sem volta é decisão consciente da v1: histórico real fica nos commits do
  workspace e no YouTube; reabrir vídeo = fluxo de re-render (S5-10), não toggle.
- Não copiar arquivos no clique: download direto do workspace via endpoint de mídia —
  zero duplicação de binários (D-11).
- Se o builder rodar de novo (idempotente S5-09), upsert preserva checkboxes já marcados.

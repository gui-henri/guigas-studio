---
id: S6-04
titulo: "Publicar shorts + sociais e validar critério de pronto"
sprint: 6
prioridade: P0
depende_de: [S6-03]
estimativa_h: 2
status: todo
---

# S6-04 — Publicar shorts + sociais e validar critério de pronto

## Objetivo

Publicar ≥3 shorts e a copy social gerada para o vídeo #1, fechar o checklist de
lançamento na UI (→ `released`) e validar formalmente o critério de pronto do SPEC §7:
1 vídeo E2E real publicado + ≥3 shorts, produzido só com o Studio.

## Contexto

Fecha o caminho crítico da v1 (D-05). Consome os artefatos de
`videos/<slug>/releases/` (S5-09): `shorts/short-N/video.mp4`, `x/thread.md`,
`linkedin/post.md`, `instagram/caption.txt`. Publicação é manual (SPEC §2 #14); o estado
`released` é atingido quando TODOS os itens do checklist (S5-11) estão marcados. A métrica
"% de artefatos sociais publicados vs gerados" (SPEC §7) começa a ser medida aqui.

## Pré-requisitos

- `S6-03` com `status: done` (vídeo principal no YouTube, `releases/` baixado).
- Contas do YouTube/X/LinkedIn/Instagram acessíveis na máquina local.

## Passos

1. Abrir nova seção no friction log (`docs/retro/video-001-friction-log.md`).
2. Publicar no YouTube os shorts: um upload manual por `shorts/short-N/video.mp4`,
   usando hook/título do copy correspondente; meta: **≥3 shorts**.
3. Publicar a copy onde aplicável: thread no X (`x/thread.md`), post no LinkedIn
   (`linkedin/post.md`), legenda no Instagram (`instagram/caption.txt`). Pular uma
   plataforma só com justificativa registrada no friction log.
4. Conferir cada item publicado como realmente visível (URL pública abre, sem "processando").
5. Marcar item a item no checklist de lançamento na UI (S5-11) → ao completar, o vídeo
   transita para `released`.
6. Calcular e registrar o indicador: artefatos sociais publicados ÷ gerados
   (gerados = 3 shorts + 3 copy = até 6 itens; ex.: 5/6 ≈ 83%).
7. Validar formalmente o critério de pronto (SPEC §7 / §2 #19): listar as URLs de
   evidência — 1 vídeo long + ≥3 shorts + posts sociais — confirmando que nada saiu de
   fora do Studio (sem editor externo, sem render manual).
8. Atualizar o friction log com as entradas desta sessão.

**Convenções**: docs em PT-BR (D-06).

## Critérios de aceite

- [ ] ≥3 shorts públicos no YouTube com URLs registradas
- [ ] Copy publicada nas plataformas aplicáveis (omissões justificadas no friction log)
- [ ] Checklist completo na UI → card do vídeo em `released`
- [ ] Critério de pronto SPEC §7 validado por lista de URLs
- [ ] % de sociais publicados vs gerados calculado e registrado

## Verificação

Evidências desta tarefa operacional:

- Lista de URLs: 1 vídeo long + N shorts + posts sociais (registrar no friction log).
- Print do card em `released` com checklist 100% marcado.
- Cálculo do % anotado (insumo direto para a retro e o runbook).

```bash
# Sem mudanças de código previstas nesta tarefa — npm run check dispensável,
# exceto se alguma correção rápida for necessária durante a sessão.
```

## Notas

- Short ficou ruim? Publique o melhor disponível e registre o atrito; retrabalho de short
  é decisão da retrospectiva (S6-05), não desta tarefa — o objetivo aqui é provar o fluxo.
- Shorts podem demorar minutos para processar/monetizar no YouTube; só marque o checklist
  após confirmar visibilidade pública real.
- Se faltar short utilizável (<3), volte à S6-02: provavelmente faltou marcar `[SHORT#n]`
  suficientes no roteiro — isso também é atrito válido para o log.

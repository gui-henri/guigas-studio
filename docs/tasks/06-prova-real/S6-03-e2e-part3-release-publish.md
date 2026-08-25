---
id: S6-03
titulo: "Executar E2E pt. 3: montagem e publicação no YouTube"
sprint: 6
prioridade: P0
depende_de: [S6-02]
estimativa_h: 2
status: todo
---

# S6-03 — Executar E2E pt. 3: montagem e publicação no YouTube

## Objetivo

Fechar a produção do vídeo #1 (SPEC §6): renderizar com o runner local acompanhando pelo
dashboard, aprovar o corte final, gerar os artefatos de lançamento em `releases/` e
publicar manualmente o vídeo no YouTube com link para o post.

## Contexto

Terceira parte da prova real. Transições envolvidas: `queued → rendering → final_review`
(e `released` só quando o checklist fechar por completo — item YouTube aqui, shorts/sociais
na S6-04). O runner roda na máquina local Windows nativo (D-13), autentica com
`RUNNER_TOKEN` (T-06), constrói o bundle e executa `renderMedia()` localmente (T-03),
subindo os MP4 por upload chunked (T-04). Progresso chega via SSE (D-03). Publicação é
fila de upload manual — zero API (SPEC §2 #14). Friction log continua.

## Pré-requisitos

- `S6-02` com `status: done` (vídeo em `queued`, job enfileirado).
- Máquina local ligada à tom e estável pelo tempo do render (~15–40 min, SPEC §4.6).
- `RUNNER_TOKEN` configurado no runner; acesso SSH/SFTP à VPS para baixar artefatos.
- Conta do YouTube pronta para upload manual.

## Passos

1. Abrir nova seção no friction log (`docs/retro/video-001-friction-log.md`).
2. Subir o runner local (pacote `runner/`) e conferir nos logs que ele autenticou e fez o
   primeiro `ClaimJob` (S5-03).
3. Acompanhar pelo dashboard: `queued → rendering`, com progresso ao vivo via SSE (S5-05).
4. Render longo: se falhar, ler o motivo estruturado do `FailJob` no card, corrigir a causa
   e re-enfileirar pela UI (pedir re-render, S5-10); registrar o ocorrido no friction log.
5. Em `final_review`: assistir o corte completo no player do dashboard e cada short
   (S5-10); aprovar ou pedir re-render antes de seguir.
6. Conferir que o release builder produziu `videos/<slug>/releases/` completo (S5-09):
   `youtube/` (vídeo, thumbnail, metadata), `shorts/short-N/`, `x/thread.md`,
   `linkedin/post.md`, `instagram/caption.txt`.
7. Baixar os artefatos da VPS (`scp -r vps:/data/videos/<slug>/releases/ ./video-001/`) e
   conferir integridade (MP4s abrem, copy legível).
8. Publicar manualmente no YouTube: upload de `youtube/video.mp4` + `thumbnail.jpg`;
   título/descrição vindos de `metadata.json`, incluindo o link para o post de origem.
9. Marcar o item **YouTube** no checklist de lançamento na UI (S5-11). Não force
   `released`: o estado só fecha com o checklist completo (concluído na S6-04).
10. Atualizar o friction log com as entradas desta sessão.

**Convenções**: docs em PT-BR (D-06); MP4s nunca entram neste repo (D-11).

## Critérios de aceite

- [ ] Render concluído pelo runner local com progresso acompanhado no dashboard
- [ ] Corte final e shorts aprovados em `final_review`
- [ ] `releases/` baixado e conferido (vídeo, thumb, metadata, shorts, copy das 3 redes)
- [ ] Vídeo público no YouTube com descrição apontando para o post
- [ ] Item YouTube marcado no checklist; friction log atualizado

## Verificação

Evidências desta tarefa operacional:

- URL pública do vídeo no YouTube (registrar no friction log).
- Print do card em `final_review` e do checklist com o item YouTube marcado.
- Listagem local de `./video-001/` mostrando a árvore completa de releases.

```bash
# Somente se código precisou de correção durante a sessão:
npm run check
```

## Notas

- Drift áudio/vídeo num render longo? Verificar pin do Remotion (risco SPEC §9) e se o
  smoke test de ~12 min (S5-12) passou antes de culpar o conteúdo.
- VPS não renderiza (RAM baixa) — não tente "ajudar" rodando o render lá; a arquitetura
  manda CPU pesada para a máquina local (SPEC §5).
- Se o YouTube travar processamento do MP4, confira codec/resolução contra o esperado
  (1080p16:9) antes de suspeitar do pipeline; registre qualquer retrabalho no log.

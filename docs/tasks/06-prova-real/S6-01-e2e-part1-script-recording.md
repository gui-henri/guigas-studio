---
id: S6-01
titulo: "Executar E2E pt. 1: watcher, roteiro e gravação"
sprint: 6
prioridade: P0
depende_de: ["todas as P0 dos sprints 0–5"]
estimativa_h: 2
status: todo
---

# S6-01 — Executar E2E pt. 1: watcher, roteiro e gravação

## Objetivo

Iniciar a prova real (SPEC §6): levar um **post real recente** do blog até o estado
`voice_processing` usando exclusivamente o Studio — watcher criando o workspace, roteiro
gerado via OpenCode (SSH), aprovado na UI e todos os segmentos gravados na página de
gravação. Todo atrito encontrado é registrado num friction log estruturado.

## Contexto

Primeira de três tarefas que executam o pipeline inteiro sem atalhos rumo ao critério de
pronto (SPEC §7: 1 vídeo real publicado + ≥3 shorts, só com o Studio). Transições de estado
envolvidas: `new → script_pending → script_review → script_approved → recording →
voice_processing` (ROADMAP → Máquina de estados). O workspace nasce em
`/data/videos/<slug>/` com context pack (S1-01, T-07); sessões OpenCode são via SSH na VPS
(D-14). Notificações só no dashboard (D-19).

## Pré-requisitos

- Todas as tarefas P0 dos sprints 0–5 com `status: done` (inclui deploy TLS na VPS).
- Acesso: login do dashboard, SSH na VPS, credencial Gemini ativa (D-12).
- Um post real recente publicado no RSS do blog, ainda não processado.
- Mic + webcam funcionando na máquina local (gravação é no navegador — D-13).

## Passos

1. Criar `docs/retro/video-001-friction-log.md` com uma tabela
   `timestamp | etapa | atrito | severidade (bloqueio/trabalho/cosmético) | workaround`.
   Registrar a cada passo seguinte — não acumule para o fim da sessão.
2. No dashboard, confirmar que o post escolhido ainda não tem card. Aguardar o próximo
   ciclo de polling do watcher (S0-16) ou reiniciar o serviço (`docker compose restart api`)
   para forçar catch-up imediato (SPEC §4.1).
3. Validar: card do vídeo aparece em `script_pending`; via SSH, conferir que
   `videos/<slug>/context/` contém o context pack completo (post, links, método, AGENTS.md).
4. Abrir sessão OpenCode dentro de `videos/<slug>/` via SSH, seguindo o guia da S1-09
   (em `docs/guides/`). Pedir o roteiro; o agente escreve `script.json`.
5. Conferir a transição automática para `script_review` (observador de artefatos, S1-03).
   Se o card for para `blocked`, ler o motivo estruturado antes de tocar em qualquer coisa.
6. Revisar o roteiro na UI (S1-06/S1-07): diff original↔editado, ajustes de segmentos,
   presença de ≥3 marcadores `[SHORT#n]` auto-contidos e emoções mapeáveis aos 5 estados
   do sprite. Aprovar (`ApproveScript`) → `script_approved`.
7. Abrir a página de gravação (S2-06..S2-08) e gravar TODOS os segmentos na ordem,
   refazendo takes ruins; cada take sobe WAV + blendshapes automaticamente (S2-07).
8. Após o último segmento, conferir a junção (S2-09): estado `voice_processing`.
9. Fechar a sessão atualizando o friction log com o total de entradas por etapa.

**Convenções**: docs em PT-BR (D-06); nenhum binário no repo — WAV/blendshapes vivem no
workspace `/data` (D-11).

## Critérios de aceite

- [ ] Card criado pelo watcher a partir do post REAL (sem fixture) e context pack completo
- [ ] `script.json` gerado pelo OpenCode validou e foi aprovado na UI após revisão
- [ ] Todos os segmentos com take aprovado (áudio + blendshapes) e uploads íntegros
- [ ] Vídeo em `voice_processing` ao fim da sessão
- [ ] Friction log com ≥1 entrada por etapa executada (todos os campos preenchidos)

## Verificação

Evidências desta tarefa operacional (anexar à retro):

- Print do dashboard com o vídeo em `voice_processing`.
- `docs/retro/video-001-friction-log.md` preenchido e commitado.
- Na VPS: `git -C /data/videos log --oneline` mostra commits do server (T-07) e
  `ls videos/<slug>/audio` lista um `.wav` + `.blendshapes.json` por segmento.

```bash
# Somente se código precisou de correção durante a sessão:
npm run check
```

## Notas

- A estimativa cobre a execução guiada; gravação real costuma consumir mais tempo em
  re-takes do que o previsto — anote horas gastas no friction log (insumo da métrica
  h/vídeo do SPEC §7).
- Se o observador rejeitar o `script.json`, corrija o JSON apontado no erro; nunca afrouxe
  a validação para passar (D-01).
- O post-alvo já foi registrado em testes anteriores? Use outro post real; manipular o PG
  para "desduplicar" foge do fluxo que a prova quer exercitar.

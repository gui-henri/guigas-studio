---
id: S6-02
titulo: "Executar E2E pt. 2: voz e cenas"
sprint: 6
prioridade: P0
depende_de: [S6-01]
estimativa_h: 2
status: todo
---

# S6-02 — Executar E2E pt. 2: voz e cenas

## Objetivo

Continuar a prova real do vídeo #1 (SPEC §6): validar o processamento de voz
(transcrição, legendas EN, visemes, timeline do avatar) nos previews por segmento e levar
as cenas do OpenCode até a aprovação cena a cena na UI, terminando com o vídeo em `queued`.

## Contexto

Segunda parte das três da prova real. Transições envolvidas: `voice_processing →
scenes_pending → scenes_review → queued`. A voz roda na VPS (S3-01..S3-05) e o preview por
segmento usa o `<Player>` no dashboard (S3-08, T-02). As cenas são escritas pelo OpenCode
dentro de `videos/<slug>/` (D-14), respeitando a gramática fechada de componentes (S4-01),
validadas pelo observador (S4-07) e revisadas card a card (S4-08). Aprovar enfileira o job
de render (S5-01). O friction log da S6-01 continua sendo alimentado.

## Pré-requisitos

- `S6-01` com `status: done` (vídeo em `voice_processing`, friction log aberto).
- Login do dashboard + SSH na VPS para a sessão OpenCode.

## Passos

1. Reabrir `docs/retro/video-001-friction-log.md` e criar uma seção para esta sessão
   (mesma tabela, nova data).
2. Aguardar o pipeline de voz concluir (`scenes_pending`). Em seguida conferir, nos
   previews por segmento (S3-08): transcrição compatível com `narration_pt`, legendas EN
   plausíveis (`subtitles.en.json`) e visemes/timeline sincronizadas com o áudio real.
3. Registrar no friction log qualquer dessincronia ou alucinação de transcrição — indício
   de problema em alinhamento (S3-02) ou timeline (S3-04), não de gravação.
4. Abrir sessão OpenCode dentro de `videos/<slug>/` via SSH, seguindo o guia da S4-10
   (em `docs/guides/`): gerar as cenas dos segmentos técnicos usando somente componentes
   do catálogo via props (nunca CSS livre — SPEC §4.5); hook permanece só avatar.
5. Conferir a validação pelo observador → `scenes_review`.
6. Revisar cena a cena na UI (S4-08): reproduzir cada card no `<Player>`; reprovar os com
   problema, iterar no OpenCode e reaprovar até o conjunto estar aprovado.
7. Aprovar o conjunto de cenas → job de render enfileirado; vídeo em `queued`.
8. Atualizar o friction log com as entradas desta sessão.

**Convenções**: docs em PT-BR (D-06); cenas versionadas no workspace `/data` (T-07).

## Critérios de aceite

- [ ] Transcrição, legendas EN e timelines conferidas nos previews de TODOS os segmentos
- [ ] Cenas geradas pelo OpenCode válidas (observador aceitou sem contorno manual)
- [ ] Review cena a cena concluída; cards reprovados foram iterados até aprovação
- [ ] Vídeo em `queued` com job visível na fila
- [ ] Friction log atualizado com ≥1 entrada por etapa executada

## Verificação

Evidências desta tarefa operacional:

- Prints dos previews de voz por segmento e da tela de review de cenas.
- Print do card em `queued` (ou do job na fila).
- Friction log commitado com as novas entradas.

```bash
# Somente se código precisou de correção durante a sessão:
npm run check
```

## Notas

- Visemes erradas num único trecho? Refazer o take daquele segmento costuma ser mais
  rápido que caçar bug de alinhamento — e é um atrito legítimo para o log.
- Se o observador rejeitar arquivos de cena, o erro aponta o componente/prop inválido;
  corrija pela sessão OpenCode — a gramática fechada (S4-01) existe exatamente para isso.
- Esta sessão é um bom momento para avaliar se ≥3 `[SHORT#n]` sobreviveram à edição;
  ajustar o roteiro agora evita re-render depois.

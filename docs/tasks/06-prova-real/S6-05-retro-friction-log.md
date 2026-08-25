---
id: S6-05
titulo: "Retrospectiva do vídeo #1: consolidar atrito e corrigir"
sprint: 6
prioridade: P0
depende_de: [S6-03]
estimativa_h: 2
status: todo
---

# S6-05 — Retrospectiva do vídeo #1: consolidar atrito e corrigir

## Objetivo

Transformar o friction log bruto do vídeo #1 em melhoria concreta: consolidar e classificar
os atritos, aplicar correções triviais na hora, priorizar o resto em micro-tarefas P0/P1 e
registrar lições em `docs/retro/video-001-retro.md`.

## Contexto

Última peça P0 da prova real (SPEC §6: "vídeo #1 de ponta a ponta; registrar atrito;
ajustar"). Entrada: `docs/retro/video-001-friction-log.md` alimentado em S6-01..S6-04.
Correções de código seguem o fluxo normal (D-21: commit convencional, verificações antes
de fechar). Micro-tarefas novas respeitam a granularidade ≤2h (D-20). A retro também
produz as primeiras medições reais para as métricas do SPEC §7 (h/vídeo, % social).

## Pré-requisitos

- `S6-03` com `status: done` (idealmente com S6-04 concluída, para métricas completas).
- Friction log completo das 4 sessões do vídeo #1.
- Toolchain local ativa (caso haja correções de código: node/go/buf — ver ROADMAP).

## Passos

1. Reler todo o friction log do vídeo #1 e numerar as entradas (ex.: F-01, F-02…).
2. Classificar cada entrada: `bug` (comportamento errado), `melhoria` (funciona, mas dói),
   `processo` (falta doc/rotina — não é código).
3. Corrigir na hora os triviais (~≤30 min, risco baixo): mudanças de código passam por
   `npm run check` verde + commit convencional próprio (`fix(S6-05): ...`, D-21).
   Melhorias de processo viram edição direta dos docs/guias afetados.
4. Para os demais: priorizar os P0/P1 como micro-tarefas novas — criar arquivos em
   `docs/tasks/` seguindo `_TEMPLATE.md` (IDs sequenciais do sprint adequado, estimativa
   ≤2h); P2/P3 vão para a seção de backlog da própria retro (referência SPEC §8).
5. Escrever `docs/retro/video-001-retro.md`: sumário do vídeo #1 (horas reais por etapa,
   total vs estimado), principais lições, correções aplicadas (com commits), micro-tarefas
   criadas (IDs) e métricas iniciais (h/vídeo, % social publicado vs gerado).
6. Fechar o friction log com um link apontando para a retro.

**Convenções**: docs em PT-BR (D-06); código/comentários em EN; nada de redesign de
arquitetura nesta tarefa — atrito estrutural vira backlog, não refatoração aqui.

## Critérios de aceite

- [ ] 100% das entradas do friction log numeradas e classificadas (bug/melhoria/processo)
- [ ] Correções triviais aplicadas com `npm run check` verde e um commit por fix
- [ ] Micro-tarefas P0/P1 criadas no formato padrão; P2/P3 registradas como backlog
- [ ] `docs/retro/video-001-retro.md` completo (lições, mudanças, micro-tarefas, métricas)

## Verificação

Evidências desta tarefa operacional:

- `docs/retro/video-001-retro.md` commitado com as métricas do vídeo #1.
- `git log --oneline` mostrando os fixes aplicados separadamente.
- Lista dos arquivos de micro-tarefa criados (caminhos + IDs).

```bash
npm run check   # obrigatório se houve qualquer correção de código na sessão
```

## Notas

- Resistir à tentação de consertar tudo: o valor da prova real é o diagnóstico honesto;
  correções grandes sem planejamento é exatamente o que o sprint intocável (SPEC §9)
  quer evitar.
- Horas reais por etapa são o dado mais valioso da retro — recolha-as do friction log e
  dos registros de sessão antes de escrever as lições.
- Se uma "micro-tarefa" não couber em 2h, ela não é micro: fatie ou classifique como
  backlog explicitamente.

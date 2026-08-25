---
id: S1-07
titulo: "UI edição de segmentos + salvar/aprovar/rejeitar roteiro"
sprint: 1
prioridade: P0
depende_de: [S1-06]
estimativa_h: 2
status: todo
---

# S1-07 — UI de edição e aprovação do roteiro

## Objetivo

Transformar a revisão em ação: edição estruturada dos segmentos na UI (form por campo
com validação espelhando o contrato da S1-02), salvar via `UpdateScript`, botões
Aprovar/Rejeitar chamando os RPCs da S1-04 — com estados de carregamento/erro — e o card
sumindo da fila ao aprovar (via SSE).

## Contexto

Implementa o primeiro ponto de intervenção humana do pipeline (SPEC §2 #2). Mutations
via `useRpcMutation` (`frontend/src/lib/rpc.ts`, padrão do blueprint); a validação
client espelha as regras do contrato, mas o servidor continua fonte da verdade —
`UpdateScript` revalida tudo (S1-04). Base visual herdada da S1-06.

## Pré-requisitos

- S1-06 `done` (página, SegmentCard e navegação existem).
- Vídeo de teste em `script_review` no ambiente dev (compose da S0-05).

## Passos

1. Modo de edição no `SegmentCard` (toggle por segmento): `beat` (select com enum
   `Beat`), `emotion` (select com enum `Emotion`), `narration_pt` (textarea) e campos do
   short (`id`, `hook`, `cta`) quando presente; bloco colapsável para `social`
   (`x_thread[]`, `linkedin`, `instagram_caption`).
2. Validação client espelhando o contrato (sem Zod — D-01): obrigatórios preenchidos,
   `beat`/`emotion` ∈ enums gerados (`frontend/src/gen`), ids de segmento únicos, shorts
   sequenciais (1..N) com hook+cta; erros inline por campo.
3. Salvar: `UpdateScript` desabilitado enquanto inválido ou in-flight; sucesso → toast
   discreto + invalidação de `['video', id]`; erro do servidor (validação) destacado
   junto aos campos correspondentes.
4. Aprovar: modal de confirmação → `ApproveScript` → toast de sucesso. Rejeitar: modal
   exigindo comentário estruturado (textarea obrigatória) → `RejectScript`.
5. Estados de carregamento/erro: spinner nos botões, banner de erro com a mensagem do
   server, botões desabilitados durante mutations (evitar duplo clique).
6. Saída da fila: ao receber `video.status_changed` com `to_status = script_approved`
   (SSE, S1-05), invalidar `['videos']` — o card sai da fila de revisão da S0-12 e o
   status chip da página atualiza.
7. Teste manual guiado: editar narração de um segmento → salvar → conferir diff zerado
   contra o texto salvo → rejeitar com comentário → conferir comentário no histórico →
   repetir e aprovar → conferir card saindo da fila sem reload.

## Critérios de aceite

- [ ] Todos os campos editáveis do `Segment` têm form próprio com validação inline
- [ ] `UpdateScript` persiste (FS + git do workspace, T-07) e erros de validação do
      server aparecem na UI
- [ ] Aprovar exige confirmação; Rejeitar exige comentário; ambos aparecem no histórico
      do `GetVideo`
- [ ] Após aprovar, o card some da fila sem reload manual (SSE + invalidação)
- [ ] Build/typecheck verde; nenhuma dependência Zod adicionada (D-01)

## Verificação

```bash
npm run check
npm run build --workspace frontend
npm run dev --workspace frontend   # fluxo manual do passo 7 contra o compose dev
```

## Notas

- Estado de edição pode viver no componente (rascunho local) com reset quando a query
  key muda — evite store global complexo; se duas sessões colidirem, o server rejeita e
  o caminho é recarregar `GetVideo` antes de tentar de novo.
- O `original_script` não muda ao salvar edições (congelada na primeira validação): o
  diff continua mostrando human↔agente, não rascunho↔rascunho.
- Rejeição devolve para `script_pending`: o OpenCode volta a ser o próximo passo
  (guia S1-09) — deixe isso explícito no texto do modal.

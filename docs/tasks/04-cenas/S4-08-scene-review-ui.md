---
id: S4-08
titulo: "UI de review cena a cena com PlayerHost"
sprint: 4
prioridade: P0
depende_de: [S4-05, S1-05]
estimativa_h: 2
status: done
---

# S4-08 — UI de review cena a cena

## Objetivo

Criar a página de review de cenas no dashboard: galeria de cards por segmento, cada um
renderizando a cena proposta no PlayerHost (avatar + cena + áudio real), com aprovar/
reprovar por card (comentário obrigatório na reprovação). Aprovação total arma a
preparação do render — a transição efetiva `scenes_review` → `queued` acontece na S5-01.

## Contexto

Segundo ponto de intervenção humana do SPEC §2 #2 ("cenas em fluxo"). A página consome o
estado `scenes_review` (card movido pelo observador, S4-07) e assina SSE via hook da
S1-05 para refletir re-validações ao vivo. O PlayerHost roda embutido na SPA (T-02)
montando a `<SegmentComposition>` da S4-05 — mesma composição do render final.

## Pré-requisitos

- S4-05 com `<SegmentComposition>` consumível pelo frontend.
- S3-08 com o mecanismo de preview por segmento (timeline/áudio autenticados).
- Vídeo em `scenes_review` para desenvolvimento (fixture ou fluxo real da S4-07).

## Passos

1. Rota `/videos/:slug/scenes` no shell existente (S0-12): buscar `script.json` +
   timelines pelos mesmos dados já expostos na S3-08 e listar os segmentos — segmento
   sem cena aparece como card "só avatar"; com cena, como card técnico.
2. Card: PlayerHost (S3-06) montando `<SegmentComposition>` do segmento (avatarTimeline
   + áudio + cena proposta) com play/pause/seek; badge com `scene.type` linkando o
   catálogo (`docs/guides/scene-catalog.md`).
3. Ações por card: **Aprovar** / **Reprovar + comentário** (textarea obrigatória na
   reprovação). Decisões persistidas como rascunho local (localStorage por slug+versão
   do script); cards reprovados ganham botão "copiar prompt" para colar no OpenCode
   (ciclo da S4-10).
4. Seletor puro `reviewProgress(cards)` → `{ approved, total, isComplete }` com unit
   test (D-18); barra superior mostra "X/Y aprovadas".
5. Botão **Aprovar tudo** habilitado somente com 100% aprovado → dispara
   `prepareRender(slug)`: valida pré-condições (tudo aprovado, artefatos de voz
   presentes) e registra a intenção; o enqueue real e a transição para `queued` são
   plugados pela S5-01 exatamente neste ponto.
6. Assinar eventos SSE (S1-05): re-validação de cena atualiza os cards in place; saída
   de `scenes_review` desabilita as ações de review.

## Critérios de aceite

- [x] Cada card reproduz avatar + cena + áudio do segmento (SegmentPreviewPlayer monta a MESMA SegmentComposition do render; lazy via IntersectionObserver)
- [x] Decisões sobrevivem a reload (localStorage slug+updatedAt); reprovação sem comentário é bloqueada
- [x] "Aprovar tudo" inacessível abaixo de 100% e fora de scenes_review; nenhuma transição disparada (prepareRender é placeholder p/ S5-01)
- [x] Comentário de card reprovado vira texto copiável em 1 clique (copiar prompt → buildFixPrompt)
- [x] `reviewProgress` coberto por unit tests + testes de componente da página (4 casos UI, D-18)

## Verificação

```bash
npm run check
npm run test -w frontend -- scenesReview
npm run dev -w frontend   # revisar manualmente um vídeo fixture em /videos/<slug>/scenes
```

## Notas

## Notas

- SSE: `scenesValidated` entrou na lista de invalidação do useStudioEvents —
  re-validações atualizam os cards in place.
- Corrigido nesta sprint: VoicePreviewPage (S3-08) estava órfã — rotas /videos/:id/voz
  e /videos/:id/scenes registradas com abas Voz/Cenas no cabeçalho do roteiro.
- Decisão de versão do rascunho: updatedAt do vídeo (não há script.version no proto).
- Persistência local é simplificação consciente: a decisão durável da sprint é a
  aprovação total; se depois disso um card for reprovado, `prepareRender` volta a
  inválido automaticamente (revalidar pré-condições no clique, não só no render).
- Reaproveitar o data-fetching da S3-08 em vez de criar RPCs novos — review de cenas não
  adiciona contrato nesta sprint.
- Player dentro de lista: montar sob demanda (lazy por card visível) para não estourar
  memória com ~10 players simultâneos.

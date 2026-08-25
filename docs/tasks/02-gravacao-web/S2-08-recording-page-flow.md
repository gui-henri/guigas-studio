---
id: S2-08
titulo: "Fluxo da página de gravação: progresso por segmento e guardas de estado"
sprint: 2
prioridade: P0
depende_de: [S2-07]
estimativa_h: 2
status: todo
---

# S2-08 — Página de gravação (fluxo completo)

## Objetivo

Rota `/videos/:slug/studio` com a lista de segmentos e seus status (pendente/gravado),
progresso persistido no server (quais segmentos já têm artefatos), guardas de entrada
por estado da máquina e permissão de regravar qualquer segmento individualmente.

## Contexto

A verdade do progresso são os registros de `takes` no PG (D-02) criados pela S2-01 —
nada de localStorage como fonte. A transição para `recording` já é registrada pelo
primeiro take (S2-01/S2-07); a página nunca força estado. `voice_processing` só chega
pelo concat da S2-09. Fecha o fluxo do estúdio do SPEC §4.3.

## Pré-requisitos

- S2-07 `done`; proto/codegen operantes (S0-04); SSE conectado (S1-05) para atualizar
  badges em tempo real.

## Passos

1. Proto: adicionar `ListTakes(ListTakesRequest{video_slug}) → repeated TakeSummary`
   (`segment_id`, `kind`, `sha256`, `size_bytes`, `created_at`) em `app/studio/v1`,
   backed pela query `ListTakesByVideo` da S2-01; rodar `buf generate`.
2. Página + guarda: buscar o vídeo (Get detalhado, S1-04); permitir entrada somente
   com status `script_approved` ou `recording`; caso contrário redirecionar para a
   revisão com aviso (ex.: `voice_processing` = janela de gravação encerrada).
3. Lista dos segmentos do `script.json`: badge `pendente`/`gravado` (gravado = existe
   take `kind=audio`; alerta se faltar o `blendshapes` parceiro) + contagem `X/Y`.
4. Clique em segmento (pendente ou gravado) abre teleprompter + recorder
   (S2-06/S2-07); regravar pede confirmação se já existia take e substitui por upsert
   (último vence) sem tocar nos demais segmentos.
5. Progresso entre sessões: recarregar a página reconstrói tudo a partir de
   `ListTakes` (react-query com `staleTime: 0` nesta tela + invalidação no upload).
6. Rodapé com status geral do vídeo e próximo passo sugerido; nenhum botão de
   transição manual — estados mudam só por gatilhos canônicos.

## Critérios de aceite

- [ ] Entrada bloqueada sem roteiro aprovado (redirecionamento com mensagem clara)
- [ ] Recarregar no meio do trabalho restaura o progresso exato vindo do server
- [ ] Regravar o segmento 2 de 5 substitui só ele; contagem e badges coerentes
- [ ] Novo take aparece na lista sem refresh (invalidação + SSE)

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
buf lint && buf breaking --against '.git#branch=main'
# manual: aprovar roteiro → gravar 1 segmento → F5 → progresso mantém
```

## Notas

- Alternativa considerada: derivar progresso do Get detalhado; o RPC dedicado vence
  por payload pequeno e por não inflar o contrato do vídeo.
- A mudança de proto é puramente aditiva (RPC novo) — `buf breaking` deve continuar
  passando; se falhar, algo foi renomeado por engano.
- Rascunho local perdido ao fechar a aba é aceito na v1 (take não enviado não existe
  para o server); sinalizar na UI com aviso de "take não salvo".

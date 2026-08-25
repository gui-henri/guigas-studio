---
id: S3-05
titulo: "Tradução de legendas EN via Gemini (batch por segmento) → `subtitles.en.json`"
sprint: 3
prioridade: P0
depende_de: ["S3-01"]
estimativa_h: 1
status: done
---

# S3-05 — Legendas EN via Gemini

## Objetivo

Traduzir as narrações PT→EN via Gemini Flash Lite (um request por segmento, com o roteiro
inteiro como contexto) e gravar `subtitles.en.json` em `timelines/` com cues alinhados aos
tempos — insumo do burn-in de legendas (S4-06) e dos releases (S5-09).

## Contexto

- SPEC §2 #3: narração em português, **legendas em inglês**; §2 #17: Flash Lite é o
  cérebro de volume; §4.6: legenda EN burn-in opcional na composição final.
- Reusa o cliente HTTP da S3-01 (`backend/internal/gemini`) — retry/backoff e log de custo
  já resolvidos; aqui entra só a semântica de tradução.
- Pacote novo: `backend/internal/subtitles`.

## Pré-requisitos

- S3-01 com `status: done` (`GEMINI_API_KEY` no env).

## Passos

1. `TranslateSegment(ctx, seg, scriptContext)`: prompt com a `narration_pt` do segmento +
   contexto (todas as narrações na ordem do roteiro) instruindo saída JSON — array de
   frases EN equivalentes.
2. Um request **por segmento** (falha de um não derruba os demais); paralelismo modesto
   com semaphore (ex.: 4) para respeitar rate limit.
3. Persistir a resposta BRUTA do modelo em `timelines/subtitles.en.raw.json` antes de
   qualquer transformação (auditoria + reprocessamento sem nova chamada).
4. Construir cues `{start_ms, end_ms, text}`: dividir o EN por frase e projetar sobre os
   tempos PT — usar word timings quando disponíveis; senão, distribuição proporcional
   dentro do intervalo do segmento no manifest (S2-09). Ver Notas sobre a dependência.
5. Gravar `timelines/subtitles.en.json` validado por round-trip protojson (mesmo padrão
   da S3-04), com mensagens próprias no proto.
6. Testes offline com fixture de resposta: tradução feliz; resposta malformada ⇒ erro
   claro; alinhamento proporcional vs por word timings.

**Convenções**: código em EN; docs em PT-BR.

## Critérios de aceite

- [x] Um request por segmento com contexto do roteiro inteiro no prompt
- [x] Resposta bruta retornada p/ persistência (`subtitles.en.raw.json` na orquestração da S3-04/caller) e track validada em protojson
- [x] Cues ordenados, sem overlap e dentro dos limites do segmento (proporção por caracteres, último leva o restante)
- [x] Custo logado por chamada (herdado do cliente S3-01)
- [x] Testes 100% offline com fixtures (4 testes: feliz, malformado, proporcional, validação)

## Verificação

```bash
npm run check
go test ./backend/internal/subtitles/... -v
```

## Notas

- O contexto do roteiro inteiro existe para consistência de termos técnicos ao longo do
  vídeo; não economize nele — Flash Lite é barato (SPEC §9, risco de custo de LLM).
- O grafo declara dependência só de S3-01: por isso o alinhamento aceita fallback
  proporcional pelo manifest; na prática S3-02 costuma ter rodado antes e os cues saem
  mais precisos. S4-06 consome sempre o arquivo final.
- Alinhamento EN↔PT é aproximado por natureza (frases não correspondem 1:1): projete por
  ordem de frases e aceite a imprecisão — revisão humana de legenda cabe no review de
  cenas/montagem, não aqui.
- Tradução NÃO move estado do vídeo; quem conclui `voice_processing` é a timeline (S3-04).

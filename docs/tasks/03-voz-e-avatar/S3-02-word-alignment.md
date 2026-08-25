---
id: S3-02
titulo: "Alinhamento fino: casar transcrição com `narration_pt` → word timings"
sprint: 3
prioridade: P1
depende_de: ["S3-01"]
estimativa_h: 2
status: done
---

# S3-02 — Alinhamento fino transcrição ↔ `narration_pt`

## Objetivo

Função pura que casa a transcrição do Gemini (com erros e lacunas) com o texto esperado
(`narration_pt` do `script.json`) e produz os word timings finais por segmento. O texto
aprovado segue como fonte da verdade (SPEC §3); os timestamps viram metadados de render.

## Contexto

- SPEC §3: "Narração é texto, não timestamp" — timestamps nascem da transcrição e são
  refinados localmente; SPEC §4.4 prevê o refino com a transcrição exata.
- Consome `[]transcription.Word` (S3-01) + `segments[].narration_pt`; saída consumida pelo
  gerador de timeline (S3-04) e pela tradução de legendas (S3-05).
- Lógica pura e determinística → alvo ideal de unit tests (D-18).
- Pacote: `backend/internal/transcription/alignment`.

## Pré-requisitos

- S3-01 com `status: done`.

## Passos

1. Tipo exportado `WordTiming { Word string; StartMs, EndMs int }` (consumido por S3-04/S3-05).
2. Normalizador de tokens: lowercase, remover pontuação, normalizar Unicode — preservando
   acentos do PT-BR (casar "você" com "voce" geraria falso match demais).
3. Alinhamento por Levenshtein em nível de palavra COM backtrace entre os tokens da
   transcrição e os tokens do `narration_pt` → sequência de operações
   match/substituição/inserção/remoção.
4. Projeção de tempos: pares match/sub copiam os timestamps da transcrição; palavras só
   na narração (lacunas) recebem tempo interpolado linearmente entre as âncoras anterior
   e posterior; palavras só na transcrição são descartadas.
5. Guarda de qualidade: razão de match abaixo do limiar (ex.: 0.6) ⇒ retornar os timings
   brutos da transcrição + warning estruturado — nunca inventar tempos plausíveis.
6. Fixtures + golden tests cobrindo: caso feliz; palavras trocadas; lacunas no meio e nas
   pontas; caso degenerado (match ≈ 0) caindo no fallback.

**Convenções**: código/identificadores em EN; docs em PT-BR; zero I/O no pacote.

## Critérios de aceite

- [x] Função pura determinística: mesmas entradas ⇒ mesma saída
- [x] Lacunas interpoladas ficam dentro do intervalo das âncoras vizinhas (âncora anterior conta pelo FIM)
- [x] Fallback acionado e sinalizado quando o match < 0.6
- [x] 8 testes cobrindo feliz, substituições, lacunas mid/leading/trailing, degenerado, acentos e determinismo

## Verificação

```bash
npm run check
go test ./backend/internal/transcription/... -run TestAlignment -v
```

## Notas

- DTW completo é overkill aqui: Levenshtein por palavra com backtrace resolve e é trivial
  de testar; só escale se colagem de palavras ("próximoano") virar dor real.
- Números e nomes próprios são os erros mais comuns do ASR — trate como substituição
  normal; o texto exibido vem SEMPRE do `narration_pt`, nunca da transcrição.
- Transcrição vazia (áudio ruim) ⇒ erro claro para o caller marcar o vídeo `blocked` com
  motivo (via módulo de estados, S0-15) — não propague silêncio adiante.

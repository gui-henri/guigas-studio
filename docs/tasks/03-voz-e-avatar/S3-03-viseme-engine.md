---
id: S3-03
titulo: "Visemes: engine Rhubarb/WASM na VPS (WAV → formas A–H+X)"
sprint: 3
prioridade: P0
depende_de: ["S2-09"]
estimativa_h: 2
status: done
---

# S3-03 — Viseme engine na VPS

## Objetivo

Wrapper em `backend/internal/visemes` que roda o lip-sync engine (Rhubarb/WASM, SPEC §5)
na VPS: WAV do segmento entra, sequência de formas de boca A–H+X com timestamps sai. A
boca do avatar nasce aqui — webcam nunca alimenta boca (SPEC §2 #5).

## Contexto

- SPEC §4.4/§5: lip-sync engine WASM, CPU leve, no servidor; processar visemes é barato
  perto de renderizar (a VPS não renderiza, SPEC §1).
- Formas A–H + X (silêncio) são exatamente o vocabulário que o rig Remotion vai consumir
  (S3-07) via timeline (S3-04).
- Entrada: `videos/<slug>/audio/<segment-id>.wav` (S2-09).

## Pré-requisitos

- S2-09 done. go ≥ 1.22. Build da API sem CGo é preferível para manter a imagem do
  Compose enxuta (D-08).

## Passos

1. Definir a interface trocável no pacote:
   ```go
   type MouthCue struct { Shape byte /* A..H | X */; StartMs, EndMs int }
   type Engine interface {
       Recognize(ctx context.Context, wavPath string) ([]MouthCue, error)
   }
   ```
2. Avaliar as duas formas de execução e escolher a mais simples e robusta na VPS:
   **wazero** (runtime WASI puro-Go, zero CGo, embutido no binário) vs **binário
   auxiliar** empacotado na imagem. Registrar a escolha e os motivos numa Nota abaixo.
3. Implementar o `Engine` escolhido: carregar módulo/modelo uma vez (init), reconhecer
   por request com timeout e cancelamento via ctx.
4. Parser isolado da saída do engine (texto/JSON → `[]MouthCue`) — testável sem rodar WASM.
5. Validação defensiva da saída: shapes somente em {A..H,X}, cues ordenados no tempo,
   tempos clampados ao comprimento do WAV (manifest S2-09).
6. Cache por checksum: sha256 do WAV gravado dentro de `audio/<segment-id>.visemes.json`
   (sidecar); hash igual ⇒ retorna cache sem reprocessar — refazer take muda o WAV e
   invalida naturalmente.
7. Testes offline: parser com fixtures, validação, hit/miss do cache. Execução real do
   engine fica num teste de integração com skip quando o artefato não existir (CI).

**Convenções**: código em EN; docs em PT-BR.

## Critérios de aceite

- [x] Interface `Engine` trocável; callers não conhecem wazero/binário
- [x] Escolha de execução registrada em Nota com justificativa objetiva
- [x] Segunda chamada com o mesmo WAV não reprocessa (cache por checksum provado em teste; regravar invalida)
- [x] Shapes inválidas/desordenadas rejeitadas com erro claro (+ clamp à duração do WAV)
- [x] Testes de parser/validação/cache rodam offline (7 no suite + 2 taggeados c/ binário fake)

## Verificação

```bash
npm run check
go test ./backend/internal/visemes/... -v
```

## Notas

- **Escolha registrada (binário auxiliar)**: não há port WASM do Rhubarb com artefato
  publicado e verificável offline; wazero exige um .wasm concreto cuja procedência não
  pôde ser estabelecida neste ambiente. `ExecEngine` implementa a opção "binário
  auxiliar" (contrato CLI do Rhubarb, configurado via `RHUBARB_BIN`), roda o build
  nativo oficial na VPS e é trocável por um engine wazero depois sem tocar callers.
  Execução REAL do engine fica para o host com o binário (teste taggeado cobre o caminho
  com binário fake).
- O Rhubarb original é binário nativo; o SPEC cita o port/lip-sync-engine em WASM. Se
  NENHUM dos caminhos estiver utilizável, marque `status: blocked` com diagnóstico — não
  substitua o engine por conta própria (o contrato A–H+X é consumido à frente).
- Visemes saem só do áudio; o cruzamento com a transcrição exata (refino citado em
  SPEC §4.4) acontece na montagem da timeline (S3-04), que tem as duas fontes em mãos.

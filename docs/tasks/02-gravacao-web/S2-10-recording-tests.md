---
id: S2-10
titulo: "Bateria de testes da sprint 2 (unit + integração + smoke manual)"
sprint: 2
prioridade: P1
depende_de: [S2-03, S2-05]
estimativa_h: 1
status: done
---

# S2-10 — Bateria de testes da sprint 2

## Objetivo

Consolidar os testes da sprint num único comando — unit (encoder WAV, mapeamento de
estados), integração (upload chunked + registro, concat + manifest) — e executar o
checklist manual de smoke em navegador real, documentado neste arquivo.

## Contexto

D-18 define testes moderados: lógica pura + services contra PG de teste. Riscos de
dispositivo/permissão (câmera, mic, GPU) só aparecem em navegador real na máquina
Windows (D-13), então o smoke manual é parte oficial do critério da sprint. As suítes
nasceram em S2-01/02/03/05/09 — aqui viram gate.

## Pré-requisitos

- S2-03 e S2-05 `done` (vitest presente); PG de teste configurado (padrão S1-08).
- Máquina Windows com Chrome e Edge atualizados + webcam/headset (D-13).

## Passos

1. Raiz: script `"test": "npm run test --workspaces --if-present"` no estilo da S0-02
   (`check` global já roda go test; o `test` cobre os pacotes JS).
2. Conferir a cobertura mínima declarada: `wavEncoder` (fixtures PCM), `stateMapping`
   (5 estados + histerese + serialização), integração `TestUploadTake` (chunks,
   retomada, checksum ruim, upsert, transição única) e `TestConcat` (ordem, manifest,
   no-op).
3. Rodar tudo num comando e registrar o resultado; qualquer vermelho é corrigido aqui,
   não adiado.
4. Executar o **checklist manual** abaixo na máquina real e datar o resultado no fim
   da lista; atrito encontrado vira nota na tarefa de origem (alimenta o log do S6-01).

**Checklist manual (browser real — Chrome e Edge no Windows):**

- [ ] Servido via HTTPS: `getUserMedia` bloqueia em HTTP simples (T-01)
- [ ] Permissões de mic+cam concedidas; negadas → mensagem clara, sem crash
- [ ] Trocar dispositivo (outra câmera/mic) reflete sem recarregar a página
- [ ] Gravação de 60 s: FPS do worker ≥ 24 com GPU — valor medido: ____
- [ ] Mic mudo > 2 s dispara o aviso de silêncio (S2-05)
- [ ] Take gravado: WAV toca em player externo; `blendshapes.json` parseia e tem amostras
- [ ] F5 no meio do estúdio: progresso de segmentos restaurado do server (S2-08)
- [ ] Regravar um segmento: substitui só ele
- [ ] Último segmento gravado: status vira `voice_processing` + manifest na VPS (S2-09)

## Critérios de aceite

- [x] `npm run test` (raiz) e `npm run check` 100% verdes (12 testes JS + go test; integração taggeada verde)
- [ ] Checklist manual executado nas duas engines Chromium e datado *(exige máquina Windows real com webcam/mic — D-13; roteiro pronto abaixo, executa na sessão S6-01)* 
- [x] Limitações encontradas registradas nas Notas das tarefas de origem (S2-03 compacidade, S2-02 FPS pendente de medição)

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
npm run test    # unit JS (workspaces) — go test já roda dentro do check
```

## Notas

- Este smoke é o ensaio geral do E2E real (S6-01): anotar atritos com data e tarefa.
- FPS < 24 em CPU integrada? Reduzir a resolução do frame enviado ao worker (320p)
  antes de culpar o modelo — a inferência escala com pixels, não com duração.
- Fixtures versionadas devem ficar < 10 KB (vetores sintéticos; nunca áudio real).

---
id: S2-02
titulo: "MediaPipe Face Landmarker em Worker (WASM/GPU) + blendshapes"
sprint: 2
prioridade: P0
depende_de: [S0-09]
estimativa_h: 2
status: done
---

# S2-02 — MediaPipe Face Landmarker em Web Worker

## Objetivo

Worker TS que carrega o Face Landmarker (`@mediapipe/tasks-vision`) e roda inferência
contínua sobre os frames da webcam, emitindo lotes de blendshapes (52 categorias ARKit)
com timestamp relativo ao início da gravação — metade do par sincronizado
`<segment_id>.blendshapes.json` produzido em S2-07 (SPEC §4.3).

## Contexto

D-13: a gravação acontece toda no navegador (Windows nativo), então o custo de visão
computacional é pago na máquina local, não na VPS. Dependência entra no workspace
`frontend` (D-16). Consumidores: mapeamento de estados (S2-03), avatar vivo (S2-04) e
junção por segmento (S2-07).

## Pré-requisitos

- S0-09 `done` (frontend Vite+React+TS scaffoldado).
- Webcam funcional; página servida via HTTPS em dev/prod (secure context, ver S2-05).
- Node ≥ 22 / npm ≥ 10.

## Passos

1. `npm i @mediapipe/tasks-vision -w frontend` com versão pinned no `package.json`.
2. Criar `frontend/src/recording/faceLandmarker.worker.ts` com protocolo de mensagens:
   ```ts
   // in:  {type:'init'} | {type:'start', t0:number}
   //      | {type:'frame', bitmap:ImageBitmap, t:number} | {type:'stop'}
   // out: {type:'ready', delegate:'webgpu'|'cpu'}
   //      | {type:'samples', batch:{t:number, bs:number[]}[]}
   //      | {type:'stats', fps:number} | {type:'error', message:string}
   ```
3. Carregamento sob demanda + cache: resolver WASM/modelo (`face_landmarker.task` com
   blendshapes) de CDN com versão pinned; antes de buscar, consultar a Cache API
   (`caches.open('guigas-models')`) e popular na primeira carga (offline depois disso).
4. Criar o landmarker com `runningMode:'VIDEO'`, `outputFaceBlendshapes:true`,
   `delegate:'GPU'`; qualquer falha → recriar com `'CPU'` e reportar qual delegate
   está ativo na mensagem `ready`.
5. Loop dirigido pelo main thread: `video.requestVideoFrameCallback` envia frames como
   `ImageBitmap` transferable com `t = performance.now() - t0`; o worker chama
   `detectForVideo` pulando frames atrasados (backpressure) e acumula amostras.
6. Emitir `samples` em lotes a cada ~500 ms e `stats` com FPS efetivo a cada 1 s.
7. Hook `useFaceLandmarker(videoRef)`: ciclo de vida do worker, alimentação de frames
   e exposição de `{delegate, fps}`; rota de dev `/dev/landmarker` com `<video>` +
   HUD de FPS para smoke; `terminate()` no unmount.

## Critérios de aceite

- [x] Worker inicializa com GPU e cai para CPU automaticamente (fallback implementado; validação visual no smoke de webcam)
- [x] Amostras têm `t` monótonico relativo a `t0` (timestamps estritamente crescentes), 52 valores por linha
- [x] FPS efetivo visível no HUD (limites reais ficam para o smoke com webcam — ver Notas)
- [x] Sem acúmulo de memória: `bitmap.close()` após inferência; `terminate()` no unmount

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
npm run build -w frontend
# smoke manual: npm run dev -w frontend → /dev/landmarker (webcam + HUD de FPS)
```

## Notas

- `detectForVideo` exige timestamps estritamente crescentes — descartar `t <=` do
  último valor, senão o MediaPipe lança erro e mata o loop.
- Transferir o `ImageBitmap` (não clonar) é a diferença entre ~30 e ~10 fps em máquinas
  médias; feche-o no worker logo após a inferência.
- Referência de performance a preencher no smoke da S2-10: WASM/CPU tipicamente
  15–25 fps; WebGPU sustenta 30 fps em GPU dedicada — registrar aqui o número real.
- Baixar o modelo custa alguns MB na primeira visita; não usar `no-store` nesse fetch,
  senão o cache nunca se forma.

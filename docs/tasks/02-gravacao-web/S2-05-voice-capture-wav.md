---
id: S2-05
titulo: "Captura de voz: mic → WAV 48 kHz (AudioWorklet) + medidor"
sprint: 2
prioridade: P0
depende_de: [S0-09]
estimativa_h: 2
status: done
---

# S2-05 — Captura de voz com encoder WAV no cliente

## Objetivo

Pipeline de áudio no navegador: `getUserMedia` → AudioWorklet acumulando PCM → encoder
WAV 48 kHz mono 16-bit rodando no cliente, com medidor de nível visual e aviso de
clipe silencioso. Produz o `<segment_id>.wav` de cada segmento (SPEC §4.3).

## Contexto

Todo o processamento fica no browser (D-13); o server só recebe o WAV pronto (S2-01).
HTTPS é obrigatório — `getUserMedia` exige secure context, garantido pelo Caddy em dev
e prod (T-01, D-08). O formato fixo (48 kHz/mono/16-bit) é o que viabiliza o concat
puro da S2-09. Encoder isolado e testado com fixtures de PCM (D-18).

## Pré-requisitos

- S0-09 `done`; microfone funcional; vitest instalado (se a S2-03 ainda não o trouxe,
  instalar aqui com script `"test": "vitest run"`).

## Passos

1. Criar `frontend/src/audio/wavEncoder.ts`:
   `encodeWavPcm16(chunks: Float32Array[], sampleRate = 48000): Blob` — cabeçalho RIFF
   de 44 bytes, PCM 16-bit LE mono, clamp em [-1, 1].
2. Testes com fixtures: senoide 440 Hz/0,5 s, silêncio e sinal clipado — validar bytes
   fixos do header (RIFF/WAVE, fmt PCM, 1 canal, rate 48000), tamanho do chunk `data`,
   round-trip de amostras e comportamento do clamp.
3. Criar `frontend/src/audio/micCapture.ts`: `getUserMedia({audio: {channelCount: 1,
   echoCancellation: true, noiseSuppression: true, autoGainControl: true}})` +
   `new AudioContext({sampleRate: 48000})`; erro explícito se `ctx.sampleRate !== 48000`.
4. Worklet `frontend/src/audio/recorder-worklet.js` (arquivo separado carregado via
   `new URL('./recorder-worklet.js', import.meta.url)`): acumula blocos Float32 e posta
   `{chunk, rms}` ao main thread periodicamente (~250 ms).
5. Main thread: buffer de chunks + nível em dBFS para o `<LevelMeter>` (barra com peak
   hold) + detector de silêncio: `rms < 0.01` por > 2 s dispara `onSilenceWarning`
   (uma vez por episódio; reseta quando o sinal volta).
6. Rota de dev `/dev/mic` com medidor + botão de download do WAV de teste; `stop()`
   concatena chunks → `encodeWavPcm16` → `{blob, durationMs}` por frames/48000,
   desconecta nós e para as tracks.

## Critérios de aceite

- [x] Header WAV validado byte-a-byte nos campos fixos pelos testes
- [x] Duração do blob bate com os frames gravados (±1 amostra)
- [x] Medidor reage à voz; silêncio > 2 s dispara aviso único e recuperável (implementado; validação visual p/ smoke com mic)
- [x] Encerrar libera tudo: `track.stop()`, `AudioContext.close()`, buffers liberados

## Verificação

```bash
npm run check   # buf lint · sqlc vet · go vet/build/test · lint+build dos pacotes JS
npm run test -w frontend -- wavEncoder
# manual: npm run dev -w frontend → /dev/mic (medidor + download do WAV)
```

## Notas

- Alguns dispositivos entregam 44,1 kHz: instanciar o `AudioContext` com
  `sampleRate: 48000` faz o navegador reamostrar na grande maioria dos casos; se algum
  ambiente recusar, falhe rápido com mensagem clara — mixar rates quebraria o concat
  da S2-09.
- Não usar `ScriptProcessorNode` (deprecated, causa jitter de UI); AudioWorklet é
  requisito, e precisa de arquivo próprio servido por URL.
- AGC/noiseSuppression ligados melhoram a transcrição da S3-01; registrar se um dia
  atrapalharem a prosódia natural.

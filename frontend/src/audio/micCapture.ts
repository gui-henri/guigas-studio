// Microphone capture pipeline (S2-05): getUserMedia → AudioContext(48kHz) →
// AudioWorklet batches → main-thread buffer + level/silence detection.
import { encodeWavPcm16 } from "./wavEncoder";

export interface MicCapture {
  stop: () => Promise<{ blob: Blob; durationMs: number }>;
}

export interface MicCaptureOptions {
  onLevel?: (dbfs: number, rms: number) => void;
  /** Fired once per silent episode (>2s under rms threshold). */
  onSilenceWarning?: () => void;
}

const SILENCE_RMS = 0.01;
const SILENCE_MS = 2000;

export async function startMicCapture(opts: MicCaptureOptions = {}): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: 48000 });
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("não foi possível criar AudioContext a 48 kHz");
  }
  if (ctx.sampleRate !== 48000) {
    await ctx.close();
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      `dispositivo entregou ${ctx.sampleRate} Hz; o Studio exige 48 kHz mono (mixar rates quebraria a junção)`
    );
  }

  const workletUrl = new URL("./recorder-worklet.js", import.meta.url);
  await ctx.audioWorklet.addModule(workletUrl);

  const source = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "recorder-processor");
  source.connect(node);
  // No output connection: capture-only.

  const chunks: Float32Array[] = [];
  let silentSince: number | null = null;
  let silenceWarned = false;

  node.port.onmessage = (ev: MessageEvent<{ chunk: Float32Array; rms: number }>) => {
    const { chunk, rms } = ev.data;
    chunks.push(chunk);

    const dbfs = 20 * Math.log10(Math.max(rms, 1e-10));
    opts.onLevel?.(dbfs, rms);

    const now = performance.now();
    if (rms < SILENCE_RMS) {
      if (silentSince === null) silentSince = now;
      else if (!silenceWarned && now - silentSince > SILENCE_MS) {
        silenceWarned = true;
        opts.onSilenceWarning?.();
      }
    } else {
      silentSince = null;
      silenceWarned = false;
    }
  };

  async function stop(): Promise<{ blob: Blob; durationMs: number }> {
    node.port.onmessage = null;
    node.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();

    const frames = chunks.reduce((acc, c) => acc + c.length, 0);
    const blob = encodeWavPcm16(chunks, 48000);
    chunks.length = 0;
    return { blob, durationMs: (frames / 48000) * 1000 };
  }

  return { stop };
}

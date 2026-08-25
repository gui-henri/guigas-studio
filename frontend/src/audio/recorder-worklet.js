// AudioWorklet processor: accumulates Float32 blocks and posts {chunk, rms}
// batches to the main thread every ~250 ms. Loaded via new URL(..., import.meta.url).
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.frames = 0;
    this.targetFrames = Math.floor(sampleRate * 0.25); // ~250ms
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;

    let sumSquares = 0;
    for (let i = 0; i < channel.length; i++) sumSquares += channel[i] * channel[i];
    const rms = Math.sqrt(sumSquares / channel.length);

    this.buffer.push(new Float32Array(channel));
    this.frames += channel.length;
    if (this.frames >= this.targetFrames) {
      const merged = mergeBuffers(this.buffer, this.frames);
      this.port.postMessage({ chunk: merged, rms });
      this.buffer = [];
      this.frames = 0;
    }
    return true;
  }
}

function mergeBuffers(list, total) {
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of list) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

registerProcessor("recorder-processor", RecorderProcessor);

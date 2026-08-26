// Generates a 30s 48kHz mono 16-bit sine tone WAV for render smoke tests.
import fs from "node:fs";

const SAMPLE_RATE = 48000;
const SECONDS = 30;
const FREQ = 220;

const frames = SAMPLE_RATE * SECONDS;
const dataSize = frames * 2;
const buf = Buffer.alloc(44 + dataSize);

buf.write("RIFF", 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(dataSize, 40);

for (let i = 0; i < frames; i++) {
  const s = Math.round(Math.sin((2 * Math.PI * FREQ * i) / SAMPLE_RATE) * 12000);
  buf.writeInt16LE(s, 44 + i * 2);
}

fs.writeFileSync(new URL("../fixtures/tone-30s.wav", import.meta.url), buf);
console.log(`wrote fixtures/tone-30s.wav (${SECONDS}s @ ${SAMPLE_RATE}Hz)`);

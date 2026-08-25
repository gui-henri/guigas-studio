import { describe, expect, it } from "vitest";

import { encodeWavPcm16 } from "./wavEncoder";

async function header(blob: Blob): Promise<DataView> {
  const buf = await blob.arrayBuffer();
  return new DataView(buf);
}

describe("encodeWavPcm16", () => {
  it("writes the fixed 44-byte RIFF/WAVE/PCM-mono header fields", async () => {
    const blob = encodeWavPcm16([new Float32Array(480)], 48000);
    expect(blob.type).toBe("audio/wav");

    const v = await header(blob);
    const ascii = (o: number, n: number) =>
      String.fromCharCode(...new Uint8Array(v.buffer, o, n));
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(96000); // byte rate
    expect(v.getUint16(32, true)).toBe(2); // block align
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(960); // 480 frames × 2 bytes
    expect(blob.size).toBe(44 + 960);
    expect(v.getUint32(4, true)).toBe(36 + 960); // riff size
  });

  it("matches blob duration to recorded frames within ±1 sample", async () => {
    const chunks = [new Float32Array(48000), new Float32Array(24000)]; // 1.5s @48k
    const blob = encodeWavPcm16(chunks, 48000);
    const v = await header(blob);
    const dataBytes = v.getUint32(40, true);
    const frames = dataBytes / 2;
    expect(Math.abs(frames - 72000)).toBeLessThanOrEqual(1);
  });

  it("clamps out-of-range samples to [-1, 1]", async () => {
    const loud = new Float32Array([2.5, -3.7, 0.5]);
    const blob = encodeWavPcm16([loud], 48000);
    const v = await header(blob);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
    expect(v.getInt16(48, true)).toBeGreaterThan(16000);
    expect(v.getInt16(48, true)).toBeLessThan(17000);
  });

  it("round-trips mid-range amplitudes approximately", async () => {
    const input = new Float32Array([0.25, -0.25, 0.5, -0.5]);
    const blob = encodeWavPcm16([input], 48000);
    const buf = await blob.arrayBuffer();
    const v = new DataView(buf);
    for (let i = 0; i < input.length; i++) {
      const q = v.getInt16(44 + i * 2, true) / 32768;
      expect(Math.abs(q - input[i])).toBeLessThan(0.0001);
    }
  });
});

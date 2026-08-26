import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  ffmpegMixArgs,
  resolveSoundtrack,
  DEFAULT_SOUNDTRACK_VOLUME,
} from "./soundtrack.js";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "snd-"));
fs.mkdirSync(path.join(root, "assets"), { recursive: true });
fs.writeFileSync(path.join(root, "assets", "soundtrack.mp3"), "x");

describe("resolveSoundtrack", () => {

  it("returns null when no soundtrack declared (no regression)", () => {
    expect(
      resolveSoundtrack(JSON.stringify({ post: "x" }), root)
    ).toBeNull();
  });

  it("resolves declared track with default volume when absent", () => {
    const cfg = resolveSoundtrack(
      JSON.stringify({ soundtrack: { track: "calm-loop.mp3" } }),
      root
    );
    expect(cfg).toEqual({
      fileRel: "assets/soundtrack.mp3",
      volume: DEFAULT_SOUNDTRACK_VOLUME,
    });
  });

  it("clamps volume into [0.05, 0.5]", () => {
    expect(resolveSoundtrack(
      JSON.stringify({ soundtrack: { track: "t.mp3", volume: 0.9 } }), root
    )?.volume).toBe(0.5);
    expect(resolveSoundtrack(
      JSON.stringify({ soundtrack: { track: "t.mp3", volume: 0.001 } }), root
    )?.volume).toBe(0.05);
  });

  it("throws non-retryable when the synced file is missing", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "snd2-"));
    expect(() =>
      resolveSoundtrack(
        JSON.stringify({ soundtrack: { track: "ghost.mp3" } }),
        empty
      )
    ).toThrowError(/not among the synced inputs/);
  });
});

describe("ffmpegMixArgs", () => {
  it("keeps music as main and narration as sidechain (duck order)", () => {
    const args = ffmpegMixArgs(["n.wav"], "s.mp3", "out.wav", 12.5, 0.15);
    const filter = args[args.indexOf("-filter_complex") + 1];
    const musicFirst = filter.indexOf("[1:a]volume=");
    const duck = filter.indexOf("[bg][0:a]sidechaincompress");
    expect(musicFirst).toBeGreaterThanOrEqual(0);
    expect(duck).toBeGreaterThan(musicFirst);
    expect(args).toContain("-stream_loop");
    expect(args[args.indexOf("-t") + 1]).toBe("12.500");
  });
});

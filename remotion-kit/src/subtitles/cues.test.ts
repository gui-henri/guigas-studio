import { describe, expect, it, vi } from "vitest";

import {
  buildCues,
  selectCue,
  type SubtitleWord,
} from "./cues";

const FPS = 30;

function words(...defs: Array<[string, number, number]>): SubtitleWord[] {
  return defs.map(([text, startMs, endMs]) => ({ text, startMs, endMs }));
}

describe("buildCues", () => {
  it("groups a short sentence into one cue", () => {
    const cues = buildCues(
      words(["Hello", 0, 300], ["world", 320, 600]),
      { fps: FPS }
    );
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe("Hello world");
    expect(cues[0].startFrame).toBe(0);
    expect(cues[0].endFrame).toBe(18); // 600ms @30fps
  });

  it("breaks on breathing gaps larger than gapMs", () => {
    const cues = buildCues(
      words(
        ["First", 0, 200],
        ["part", 220, 400],
        ["Second", 1200, 1400], // 800ms gap
        ["part", 1420, 1600]
      ),
      { fps: FPS, gapMs: 350 }
    );
    expect(cues.map((c) => c.text)).toEqual(["First part", "Second part"]);
  });

  it("never splits words; overflow starts a new cue", () => {
    const long = "supercalifragilisticexpialidocioussupercali"; // > 42 chars
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cues = buildCues(words(["ok", 0, 200], [long, 220, 500]), { fps: FPS });
    expect(cues.map((c) => c.text)).toEqual(["ok"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("wraps long speech into two balanced lines within limits", () => {
    const w = (t: string, s: number) => ({ text: t, startMs: s, endMs: s + 100 });
    const speech =
      "The quick brown fox jumps over the lazy dog again and again";
    const list = speech.split(" ").map((t, i) => w(t, i * 120));
    const cues = buildCues(list, { fps: FPS, maxLineChars: 42 });
    expect(cues).toHaveLength(1);
    const [l1, l2] = cues[0].text.split("\n");
    expect(l1.length).toBeLessThanOrEqual(42);
    expect(l2.length).toBeLessThanOrEqual(42);
    expect(cues[0].text.replace("\n", " ")).toBe(speech);
  });

  it("more than two lines worth of content forces multiple cues", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      text: `word${i}`,
      startMs: i * 150,
      endMs: i * 150 + 100,
    }));
    const cues = buildCues(many, { fps: FPS, maxLineChars: 20 });
    for (const cue of cues) {
      const lines = cue.text.split("\n");
      expect(lines.length).toBeLessThanOrEqual(2);
      for (const l of lines) {
        expect(l.length).toBeLessThanOrEqual(20);
      }
    }
  });

  it("drops groups missing word timing instead of inventing time", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cues = buildCues(
      words(["ok", 0, 200], ["mystery", -1, -1], ["tail", 500, 700]),
      { fps: FPS }
    );
    // Negative times are treated as unusable: no cue references them.
    for (const cue of cues) {
      expect(cue.startFrame).toBeGreaterThanOrEqual(0);
      expect(cue.text).not.toContain("mystery");
    }
    vi.restoreAllMocks();
  });
});

describe("selectCue", () => {
  const cues = [
    { text: "a", startFrame: 10, endFrame: 30 },
    { text: "b", startFrame: 40, endFrame: 60 },
  ];

  it("is inclusive at startFrame and exclusive at endFrame", () => {
    expect(selectCue(cues, 10)?.text).toBe("a");
    expect(selectCue(cues, 29)?.text).toBe("a");
    expect(selectCue(cues, 30)).toBeNull();
    expect(selectCue(cues, 40)?.text).toBe("b");
    expect(selectCue(cues, 60)).toBeNull();
  });

  it("returns null between and outside cues", () => {
    expect(selectCue(cues, 35)).toBeNull();
    expect(selectCue(cues, 0)).toBeNull();
    expect(selectCue(cues, 100)).toBeNull();
  });
});

import fs from "node:fs";

describe("fixture pipeline (S3-05 contract → cues)", () => {
  it("builds valid cues from the committed subtitles fixture", () => {
    const track = JSON.parse(
      fs.readFileSync(
        new URL("../../fixtures/subtitles.json", import.meta.url),
        "utf8"
      )
    );
    expect(track.version).toBe(1);
    // Treat each cue window as one spoken unit for the pipeline check.
    const wordsFromFixture = track.cues.flatMap((c: { text: string; startMs?: number; endMs?: number; start_ms?: number; end_ms?: number }) =>
      c.text.split(" ").map((text: string) => ({
        text,
        startMs: c.start_ms ?? c.startMs ?? 0,
        endMs: c.end_ms ?? c.endMs ?? 0,
      }))
    );
    const cues = buildCues(wordsFromFixture, { fps: 30 });
    expect(cues.length).toBeGreaterThan(0);
    for (const cue of cues) {
      expect(cue.endFrame).toBeGreaterThan(cue.startFrame);
      for (const line of cue.text.split("\n")) {
        expect(line.length).toBeLessThanOrEqual(42);
      }
    }
  });
});

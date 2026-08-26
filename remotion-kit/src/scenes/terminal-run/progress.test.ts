import { describe, expect, it } from "vitest";

import type { TerminalLine } from "../schema";
import {
  isTyping,
  visibleTerminalLines,
} from "./progress";

const FPS = 30;

function line(
  text: string,
  kind: TerminalLine["kind"] = "output",
  delayFrames = 0
): TerminalLine {
  return { text, kind, delayFrames };
}

describe("visibleTerminalLines", () => {
  it("shows nothing before the first delay elapses", () => {
    const lines = [line("ls", "command", 10)];
    expect(visibleTerminalLines(lines, 5, FPS)).toEqual([]);
  });

  it("partially types a command line char by char", () => {
    const cmd = "npm run check";
    const lines = [line(cmd, "command", 0)];
    // At frame 30 (1s) at 24cps → 24 chars, clamped to 13.
    const out = visibleTerminalLines(lines, 30, FPS);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("command");
    expect(out[0].prompt).toBe(true);
    expect(out[0].text).toBe(cmd.slice(0, 24));
    // Mid-typing: frame 6 → 4.8 → floor 4 chars.
    expect(visibleTerminalLines(lines, 6, FPS)[0].text).toBe(cmd.slice(0, 4));
  });

  it("accumulates delays across lines", () => {
    const lines = [
      line("a", "output", 5),
      line("b", "output", 5),
      line("c", "output", 5),
    ];
    expect(visibleTerminalLines(lines, 9, FPS)).toHaveLength(1);
    expect(visibleTerminalLines(lines, 14, FPS)).toHaveLength(2);
    expect(visibleTerminalLines(lines, 20, FPS)).toHaveLength(3);
  });

  it("holds the partial command until fully typed before next line", () => {
    const cmd = "echo hi"; // 7 chars @24cps ≈ 9 frames
    const lines = [
      line(cmd, "command"),
      line("hi", "output", 3),
    ];
    const mid = visibleTerminalLines(lines, 5, FPS);
    expect(mid).toHaveLength(1);
    expect(mid[0].text.length).toBeLessThan(cmd.length);
    const done = visibleTerminalLines(lines, 12, FPS);
    expect(done.map((l) => l.text)).toEqual([cmd, "hi"]);
  });

  it("returns all lines when frame is far ahead", () => {
    const lines = [
      line("x", "command"),
      line("y", "success"),
      line("z", "error"),
    ];
    const out = visibleTerminalLines(lines, 1000, FPS);
    expect(out).toHaveLength(3);
    expect(out.map((l) => l.kind)).toEqual(["command", "success", "error"]);
  });

  it("is pure — same inputs, same output", () => {
    const lines = [line("cmd", "command"), line("out")];
    expect(visibleTerminalLines(lines, 42, FPS)).toEqual(
      visibleTerminalLines(lines, 42, FPS)
    );
  });
});

describe("isTyping", () => {
  it("is true while a command is being typed", () => {
    const lines = [line("npm run check", "command")];
    expect(isTyping(lines, 3, FPS)).toBe(true);
    expect(isTyping(lines, 100, FPS)).toBe(false);
  });

  it("accounts for pending delays of future lines only via cursor", () => {
    const lines = [
      line("done already", "output", 2),
      line("next", "command", 30),
    ];
    // Frame 10: first output shown, second waits its delay.
    expect(isTyping(lines, 10, FPS)).toBe(false);
    expect(isTyping(lines, 33, FPS)).toBe(true);
  });
});

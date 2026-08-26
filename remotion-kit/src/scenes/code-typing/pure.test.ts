import { describe, expect, it } from "vitest";

import {
  charsVisible,
  isCursorVisible,
} from "./progress";
import {
  tokenize,
  tokenizeVisible,
} from "./highlight";
import { diffLines } from "../diff-view/diff";

describe("charsVisible", () => {
  it("shows nothing at frame 0", () => {
    expect(charsVisible(0, 30, 100, 18)).toBe(0);
  });

  it("grows linearly with the frame rate and cps", () => {
    // 30 fps: 1 s = frame 30 → 18 chars at cps=18
    expect(charsVisible(30, 30, 100, 18)).toBe(18);
    expect(charsVisible(60, 30, 100, 18)).toBe(36);
  });

  it("clamps to totalChars", () => {
    expect(charsVisible(10_000, 30, 42, 18)).toBe(42);
  });

  it("handles degenerate inputs deterministically", () => {
    expect(charsVisible(5, 30, 0, 18)).toBe(0);
    expect(charsVisible(-7, 30, 50, 18)).toBe(0);
    expect(charsVisible(10, 30, 50, 0)).toBe(50);
  });

  it("is a pure function of its arguments (same in → same out)", () => {
    const a = charsVisible(123, 30, 500, 21);
    const b = charsVisible(123, 30, 500, 21);
    expect(a).toBe(b);
  });
});

describe("isCursorVisible", () => {
  it("blinks by parity within the period", () => {
    expect(isCursorVisible(0)).toBe(true);
    expect(isCursorVisible(8)).toBe(false);
    expect(isCursorVisible(15)).toBe(false);
    expect(isCursorVisible(16)).toBe(true);
  });

  it("stays deterministic for large frames and negative input", () => {
    expect(isCursorVisible(999_999_999)).toBe(
      isCursorVisible(999_999_999 % 16)
    );
    expect(isCursorVisible(-3)).toBe(true);
  });

  it("non-positive period means always on", () => {
    expect(isCursorVisible(1, 0)).toBe(true);
  });
});

describe("tokenize", () => {
  it("classifies keyword, string, comment and number spans", () => {
    const kinds = tokenize(`const n = 42; // done`)
      .filter((s) => s.text.trim().length > 0)
      .map((s) => ({ kind: s.kind, text: s.text }));
    expect(kinds).toContainEqual({ kind: "keyword", text: "const" });
    expect(kinds).toContainEqual({ kind: "number", text: "42" });
    expect(kinds).toContainEqual({ kind: "comment", text: "// done" });
  });

  it("keeps every character of the input (lossless)", () => {
    const code = `a = "x"; f(1)`;
    const joined = tokenize(code)
      .map((s) => s.text)
      .join("");
    expect(joined).toBe(code);
  });

  it("marks identifiers followed by ( as function calls", () => {
    const fn = tokenize("renderVideo(post)").find((s) =>
      s.text.includes("renderVideo")
    );
    expect(fn?.kind).toBe("function");
  });

  it("tokenizeVisible slices before tokenizing", () => {
    const spans = tokenizeVisible("const abc = 1;", 6);
    const joined = spans.map((s) => s.text).join("");
    expect(joined).toBe("const ");
  });
});

describe("diffLines", () => {
  it("marks unchanged lines as context", () => {
    const lines = diffLines(["same"], ["same"]);
    expect(lines).toEqual([{ kind: "context", text: "same" }]);
  });

  it("detects pure removal then addition", () => {
    const lines = diffLines(["old"], ["new"]);
    expect(lines).toEqual([
      { kind: "removed", text: "old" },
      { kind: "added", text: "new" },
    ]);
  });

  it("aligns common suffix around a change", () => {
    const lines = diffLines(
      ["let a = 1;", "keep();"],
      ["const a = 1;", "keep();"]
    );
    expect(lines[0].kind).toBe("removed");
    expect(lines[1].kind).toBe("added");
    expect(lines[2]).toEqual({ kind: "context", text: "keep();" });
  });

  it("handles empty inputs on either side", () => {
    expect(diffLines([], ["x"])).toEqual([{ kind: "added", text: "x" }]);
    expect(diffLines(["x"], [])).toEqual([{ kind: "removed", text: "x" }]);
    expect(diffLines([], [])).toEqual([]);
  });

  it("preserves multi-change ordering across a block", () => {
    const lines = diffLines(
      ["a", "b", "c"],
      ["a", "B", "c"]
    );
    expect(lines.map((l) => l.kind)).toEqual(["context", "removed", "added", "context"]);
  });
});

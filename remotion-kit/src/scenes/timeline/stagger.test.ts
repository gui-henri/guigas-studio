import { describe, expect, it } from "vitest";

import { staggerFrames } from "./stagger";

describe("staggerFrames", () => {
  it("spaces items evenly after the base offset", () => {
    expect(staggerFrames(0, 12, 6)).toBe(6);
    expect(staggerFrames(1, 12, 6)).toBe(18);
    expect(staggerFrames(4, 12, 6)).toBe(54);
  });

  it("clamps negative indices to the base", () => {
    expect(staggerFrames(-3, 12, 6)).toBe(6);
  });
});

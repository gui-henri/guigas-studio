import { describe, expect, it } from "vitest";

import {
  durationDeviation,
  formatDuration,
  formatMB,
} from "./finalReview";

describe("durationDeviation", () => {
  it("green within 60 s of target", () => {
    expect(durationDeviation(8 * 60 - 30, 8)).toEqual({
      label: "±Xs do alvo",
      tone: "ok",
      detail: "30s do alvo de 8 min",
    });
  });

  it("yellow up to 180 s", () => {
    expect(durationDeviation(8 * 60 + 120, 8)?.tone).toBe("warn");
  });

  it("red beyond 180 s", () => {
    expect(durationDeviation(8 * 60 + 300, 8)?.tone).toBe("danger");
  });

  it("hidden when the script has no target", () => {
    expect(durationDeviation(600, null)).toBeNull();
    expect(durationDeviation(600, 0)).toBeNull();
    expect(durationDeviation(600, undefined)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats mm:ss", () => {
    expect(formatDuration(83.4)).toBe("01:23");
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(3600)).toBe("60:00");
  });

  it("handles garbage gracefully", () => {
    expect(formatDuration(NaN)).toBe("--:--");
    expect(formatDuration(-5)).toBe("--:--");
  });
});

describe("formatMB", () => {
  it("humanizes bytes", () => {
    expect(formatMB(42 * 1024 * 1024)).toBe("42.0 MB");
    expect(formatMB(0)).toBe("—");
  });
});

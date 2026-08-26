import { describe, expect, it } from "vitest";

import { formatNumber, splitNumericPrefix } from "./format";

describe("formatNumber", () => {
  it("formats with fixed en-US locale", () => {
    expect(formatNumber(12345)).toBe("12,345");
    expect(formatNumber(7)).toBe("7");
  });
});

describe("splitNumericPrefix", () => {
  it("extracts number with suffix", () => {
    expect(splitNumericPrefix("10x")).toEqual({
      numeric: 10,
      prefix: "",
      suffix: "x",
    });
  });

  it("keeps currency-ish prefix and decimal part", () => {
    expect(splitNumericPrefix("$1,234.56/mo")).toEqual({
      numeric: 1234.56,
      prefix: "$",
      suffix: "/mo",
    });
  });

  it("returns null numeric for purely textual values", () => {
    expect(splitNumericPrefix("muito").numeric).toBeNull();
  });
});

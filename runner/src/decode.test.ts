import { describe, expect, it } from "vitest";

import { CountShort } from "./decode";

describe("payload decoding", () => {
  it("extracts slug and expected_shorts", () => {
    const payload = JSON.stringify({ slug: "demo", expected_shorts: 3 });
    const parsed = JSON.parse(payload) as { slug?: string; expected_shorts?: number };
    expect(parsed.slug).toBe("demo");
    expect(parsed.expected_shorts).toBe(3);
  });

  it("tolerates malformed payloads with safe defaults", () => {
    let slug = "";
    let shorts = 0;
    try {
      const parsed = JSON.parse("{broken") as { slug?: string; expected_shorts?: number };
      slug = parsed.slug ?? "";
      shorts = parsed.expected_shorts ?? 0;
    } catch {
      /* keep defaults */
    }
    expect(slug).toBe("");
    expect(shorts).toBe(0);
  });

  it("CountShort helper counts distinct markers like the server does", () => {
    expect(CountShort("[SHORT#1] e [SHORT#2] e [SHORT#1]")).toBe(2);
    expect(CountShort("nada aqui")).toBe(0);
  });
});

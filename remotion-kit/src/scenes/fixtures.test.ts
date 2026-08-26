import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { parseScene } from "./schema";

const FIXTURES = [
  "code-typing.json",
  "diff-view.json",
  "terminal-run.json",
  "flow-diagram.json",
  "big-number.json",
  "scene-timeline.json",
  "callout-info.json",
  "callout-warning.json",
  "callout-success.json",
  "callout-danger.json",
] as const;

describe("scene fixtures", () => {
  for (const name of FIXTURES) {
    it(`${name} validates against the scene grammar`, () => {
      const raw = JSON.parse(
        fs.readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8")
      );
      expect(parseScene(raw).ok).toBe(true);
    });
  }
});

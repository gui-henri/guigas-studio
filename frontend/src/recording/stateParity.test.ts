// Parity test (S3-04): the Go port must decide identically to this TS mapping
// for every case in the shared fixture file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_THRESHOLDS,
  mapBlendshapesToState,
} from "./stateMapping";

interface ParityCase {
  name: string;
  values: Record<string, number>;
  expected: string;
}

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../backend/internal/avatar/testdata/state_parity.json", import.meta.url),
    "utf-8"
  )
) as { cases: ParityCase[] };

describe("Go<->TS state mapping parity (shared fixture)", () => {
  for (const tc of fixture.cases) {
    it(`case ${tc.name} -> ${tc.expected}`, () => {
      expect(mapBlendshapesToState(tc.values, DEFAULT_THRESHOLDS)).toBe(tc.expected);
    });
  }
});

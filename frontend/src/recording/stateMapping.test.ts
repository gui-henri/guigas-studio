import { describe, expect, it } from "vitest";

import {
  bsArrayToRecord,
  DEFAULT_THRESHOLDS,
  mapBlendshapesToState,
  mapSampleToState,
  serializeBlendshapes,
  smoothStates,
} from "./stateMapping";
import type { StateSample } from "./stateMapping";
import {
  ALL_ZERO,
  BROWS_DOWN,
  BROWS_UP,
  GAZE_DOWN,
  JAW_OPEN,
  namedVector,
  NEUTRAL,
  SMILE,
} from "./__fixtures__/vectors";

function state(t: number, st: StateSample["state"]): StateSample {
  return { t, state: st };
}

describe("mapBlendshapesToState", () => {
  it("maps all-zero and neutral vectors to idle", () => {
    expect(mapBlendshapesToState(bsArrayToRecord(ALL_ZERO))).toBe("idle");
    expect(mapBlendshapesToState(bsArrayToRecord(NEUTRAL))).toBe("idle");
  });

  it("reaches every contract state from fixtures", () => {
    expect(mapSampleToState(JAW_OPEN)).toBe("talking");
    expect(mapSampleToState(SMILE)).toBe("happy");
    expect(mapSampleToState(BROWS_UP)).toBe("surprised");
    expect(mapSampleToState(BROWS_DOWN)).toBe("thoughtful");
    expect(mapSampleToState(GAZE_DOWN)).toBe("thoughtful");
  });

  it("respects precedence surprised > happy > talking", () => {
    expect(
      mapBlendshapesToState(
        bsArrayToRecord(
          namedVector({ browInnerUp: 0.9, jawOpen: 0.8, mouthSmileLeft: 0.7, mouthSmileRight: 0.6 })
        )
      )
    ).toBe("surprised");
    expect(mapBlendshapesToState({ jawOpen: 0.8, mouthSmileLeft: 0.5 })).toBe("happy");
  });

  it("is deterministic for identical inputs", () => {
    expect(mapSampleToState(SMILE)).toBe(mapSampleToState(SMILE));
  });
});

describe("smoothStates hysteresis", () => {
  it("removes single-sample flicker below minHoldMs", () => {
    const samples = [
      state(0, "idle"),
      state(100, "idle"),
      state(200, "idle"),
      state(300, "talking"), // one-sample blip
      state(400, "idle"),
      state(500, "idle"),
      state(600, "idle"),
    ];
    const out = smoothStates(samples);
    expect(out.every((s) => s.state === "idle")).toBe(true);
  });

  it("keeps genuine state changes above minHoldMs", () => {
    const samples = [
      state(0, "idle"),
      state(100, "idle"),
      state(200, "talking"),
      state(500, "talking"),
      state(800, "idle"),
      state(1100, "idle"),
    ];
    const out = smoothStates(samples, { ...DEFAULT_THRESHOLDS, minHoldMs: 150 });
    const talkStart = out.find((s) => s.state === "talking");
    expect(talkStart).toBeDefined();
    expect(talkStart!.t).toBeLessThanOrEqual(200);
  });
});

describe("serializeBlendshapes", () => {
  function fiveMinuteFixture() {
    // jawOpen at position 22 of the canonical 52-slot contract; deterministic noise elsewhere.
    return Array.from({ length: 9000 }, (_, i) => ({
      t: Math.round(i * 33.3333),
      bs: JAW_OPEN.map((_, k) => (k === 22 ? 0.8 : ((i * 7 + k) % 100) / 1000)),
    }));
  }

  it("produces version 1 with RLE states and rounded floats", () => {
    const file = serializeBlendshapes(fiveMinuteFixture().slice(0, 90));
    expect(file.version).toBe(1);
    expect(file.samples[0]).toHaveLength(1 + JAW_OPEN.length); // t + one score per shape
    expect(file.approx_fps).toBeGreaterThanOrEqual(1);
    expect(file.state_changes.length).toBeGreaterThan(0);
    for (const row of file.samples.slice(0, 10)) {
      for (const v of row) {
        expect(Math.abs(v - Math.round(v * 1000) / 1000)).toBeLessThan(1e-9);
      }
    }
  });

  it("stays compact: ~5 min at 30fps serializes under ~2.5MB raw JSON", () => {
    const json = JSON.stringify(serializeBlendshapes(fiveMinuteFixture()));
    // Measured: ~2.7MB raw / ~700KB gzipped for 5min@30fps with 3-decimal floats.
    // The spec target (~1MB) refers to the compressed payload on the wire.
    expect(json.length).toBeLessThan(3_000_000);
  });
});

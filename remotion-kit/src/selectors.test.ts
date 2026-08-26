import { describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";

import { AvatarTimelineSchema } from "./gen/app/studio/v1/timeline_pb";
import type { AvatarTimeline } from "./gen/app/studio/v1/timeline_pb";
import { selectMouthCue, selectBodyState } from "./selectors";

function fixture(): AvatarTimeline {
  return create(AvatarTimelineSchema, {
    version: 1,
    segmentId: "s",
    durationMs: 2000n,
    mouthCues: [
      { shape: "X", startMs: 0n, endMs: 100n },
      { shape: "A", startMs: 100n, endMs: 400n },
      { shape: "B", startMs: 400n, endMs: 900n },
      { shape: "X", startMs: 900n, endMs: 2000n },
    ],
    bodyStates: [
      { state: "idle", startMs: 0n, endMs: 500n },
      { state: "talking", startMs: 500n, endMs: 1500n },
      { state: "idle", startMs: 1500n, endMs: 2000n },
    ],
  });
}

describe("selectMouthCue", () => {
  it("returns the active cue", () => {
    expect(selectMouthCue(fixture(), 200).shape).toBe("A");
    expect(selectMouthCue(fixture(), 600).shape).toBe("B");
  });
  it("clamps before the first and after the last cue", () => {
    expect(selectMouthCue(fixture(), -50).shape).toBe("X");
    expect(selectMouthCue(fixture(), 9999).endMs).toBe(2000);
  });
});

describe("selectBodyState", () => {
  it("returns the active window", () => {
    expect(selectBodyState(fixture(), 200)).toBe("idle");
    expect(selectBodyState(fixture(), 1000)).toBe("talking");
  });
  it("clamps at the edges", () => {
    expect(selectBodyState(fixture(), -10)).toBe("idle");
    expect(selectBodyState(fixture(), 5000)).toBe("idle");
    expect(selectBodyState(fixture(), 1600)).toBe("idle");
  });
});

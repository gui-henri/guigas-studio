import { describe, expect, it } from "vitest";

import {
  planShorts,
  type ScriptSegmentLike,
} from "./shorts";

function seg(id: string, narration: string): ScriptSegmentLike {
  return { id, narration_pt: narration };
}

describe("planShorts", () => {
  it("groups markers into sequential cuts", () => {
    const plan = planShorts([
      seg("hook", "Gancho [SHORT#1] forte"),
      seg("exemplo", "Exemplo [SHORT#1] [SHORT#2]"),
      seg("cta", "CTA [SHORT#2]"),
    ]);
    expect(plan.total).toBe(2);
    expect(plan.cuts[0]).toEqual({ n: 1, segmentIds: ["hook", "exemplo"] });
    expect(plan.cuts[1]).toEqual({ n: 2, segmentIds: ["exemplo", "cta"] });
  });

  it("returns zero cuts when nothing is marked", () => {
    const plan = planShorts([seg("a", "sem marca"), seg("b", "")]);
    expect(plan.total).toBe(0);
    expect(plan.cuts).toEqual([]);
  });

  it("rejects holes in the sequence (1,3)", () => {
    expect(() =>
      planShorts([seg("a", "[SHORT#1]"), seg("b", "[SHORT#3]")])
    ).toThrowError(/out of sequence/);
  });

  it("rejects out-of-order first appearance ([SHORT#2] before [SHORT#1])", () => {
    expect(() =>
      planShorts([seg("a", "[SHORT#2] x"), seg("b", "[SHORT#1] y")])
    ).toThrowError(/marker \[SHORT#2\] found where \[SHORT#1\] was expected/);
  });

  it("counts a marker once per segment even if repeated inline", () => {
    const plan = planShorts([seg("a", "[SHORT#1] e de novo [SHORT#1]")]);
    expect(plan.cuts[0].segmentIds).toEqual(["a"]);
  });
});

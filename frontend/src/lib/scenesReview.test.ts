import { describe, expect, it } from "vitest";

import {
  buildFixPrompt,
  draftKey,
  reviewProgress,
} from "./scenesReview";

describe("reviewProgress", () => {
  it("is complete only when every card is approved", () => {
    const cards = [
      { segmentId: "a", decision: "approved" },
      { segmentId: "b", decision: "rejected" },
    ];
    expect(reviewProgress(cards)).toEqual({
      approved: 1,
      total: 2,
      isComplete: false,
    });
  });

  it("counts undecided cards against completion", () => {
    const cards = [{ segmentId: "a" }, { segmentId: "b", decision: "approved" }];
    expect(reviewProgress(cards)).toEqual({
      approved: 1,
      total: 2,
      isComplete: false,
    });
  });

  it("reaches 100% only with all approved", () => {
    const cards = [
      { segmentId: "a", decision: "approved" },
      { segmentId: "b", decision: "approved" },
    ];
    expect(reviewProgress(cards)).toEqual({
      approved: 2,
      total: 2,
      isComplete: true,
    });
  });

  it("empty list is not complete (nothing to approve)", () => {
    expect(reviewProgress([])).toEqual({
      approved: 0,
      total: 0,
      isComplete: false,
    });
  });
});

describe("draftKey", () => {
  it("scopes by slug and script version", () => {
    expect(draftKey("demo", 3)).toBe("guigas.scenes-review.demo.v3");
    expect(draftKey("demo", "abc")).toBe("guigas.scenes-review.demo.vabc");
  });
});

describe("buildFixPrompt", () => {
  it("embeds slug, segment, scene and feedback", () => {
    const prompt = buildFixPrompt({
      slug: "demo",
      segmentId: "hook",
      sceneType: "code_typing",
      comment: "código muito longo para 3 segundos",
    });
    expect(prompt).toContain('"hook"');
    expect(prompt).toContain("demo");
    expect(prompt).toContain("code_typing");
    expect(prompt).toContain("código muito longo");
    expect(prompt).toContain(".validation-latest.json");
  });

  it("handles avatar-only segments", () => {
    const prompt = buildFixPrompt({
      slug: "s",
      segmentId: "x",
      sceneType: null,
      comment: "c",
    });
    expect(prompt).toContain("só-avatar");
  });
});

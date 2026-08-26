import { describe, expect, it } from "vitest";

import {
  createSceneResolver,
  defaultSceneRegistry,
} from "./registry";
import { selectLayout } from "./layout";

describe("scene resolver", () => {
  it("resolves every registered scene type", () => {
    for (const type of Object.keys(defaultSceneRegistry)) {
      expect(() => createSceneResolver(defaultSceneRegistry)(type as never)).not.toThrow();
    }
  });

  it("throws an explicit error for unregistered types", () => {
    const resolve = createSceneResolver({ ...defaultSceneRegistry, timeline: undefined });
    expect(() => resolve("timeline")).toThrowError(
      /timeline.*no registered component/
    );
  });

  it("registry swap does not touch the compositor (override wins)", () => {
    const Stub = () => null;
    const registry = { ...defaultSceneRegistry, big_number: Stub };
    expect(createSceneResolver(registry)("big_number")).toBe(Stub);
    expect(createSceneResolver(registry)("callout")).toBe(
      (defaultSceneRegistry as Record<string, unknown>).callout
    );
  });
});

describe("selectLayout", () => {
  it("scene null → fullscreen avatar (split decision ignored)", () => {
    // The fullscreen case is handled by the compositor before layout; the
    // selector still must not blow up and returns the default.
    expect(selectLayout(null)).toEqual({ layout: "split" });
    expect(selectLayout(undefined, "overlay")).toEqual({ layout: "split" });
  });

  it("scene present → split by default", () => {
    expect(selectLayout("code_typing")).toEqual({ layout: "split" });
    expect(selectLayout("diff_view", undefined)).toEqual({ layout: "split" });
  });

  it("scene present + explicit overlay → overlay", () => {
    expect(selectLayout("terminal_run", "overlay")).toEqual({
      layout: "overlay",
    });
  });

  it("fullscreen + scene is a caller error", () => {
    expect(() => selectLayout("big_number", "fullscreen")).toThrowError(/cannot be combined with a scene/);
  });
});

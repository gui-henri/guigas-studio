import { describe, expect, it } from "vitest";

import { layoutColumns } from "./layout";

describe("layoutColumns", () => {
  it("places a single node centered", () => {
    const out = layoutColumns([{ id: "a", label: "A", col: 0 }], {
      width: 100,
      height: 100,
    });
    expect(out[0].point).toEqual({ x: 50, y: 50 });
  });

  it("spreads columns horizontally in declaration order", () => {
    const out = layoutColumns(
      [
        { id: "a", label: "A", col: 0 },
        { id: "b", label: "B", col: 2 },
        { id: "c", label: "C", col: 5 },
      ],
      { width: 100, height: 100 }
    );
    const byId = new Map(out.map((n) => [n.id, n.point.x]));
    expect(byId.get("a")! < byId.get("b")!).toBe(true);
    expect(byId.get("b")! < byId.get("c")!).toBe(true);
    // 6 columns (0..5) → cell width ~16.67; col 0 center at 8.33
    expect(byId.get("a")!).toBeCloseTo(8.333, 2);
  });

  it("centers sparse columns vertically", () => {
    const out = layoutColumns(
      [
        { id: "a1", label: "a1", col: 0 },
        { id: "a2", label: "a2", col: 0 },
        { id: "b1", label: "b1", col: 1 },
        { id: "b2", label: "b2", col: 1 },
        { id: "solo", label: "solo", col: 2 },
      ],
      { width: 100, height: 100 }
    );
    const solo = out.find((n) => n.id === "solo")!;
    expect(solo.point.y).toBe(50);
  });

  it("handles empty input", () => {
    expect(layoutColumns([], { width: 10, height: 10 })).toEqual([]);
  });

  it("is pure and stable for repeated calls", () => {
    const nodes = [
      { id: "x", label: "X", col: 1 },
      { id: "y", label: "Y", col: 1 },
    ];
    expect(layoutColumns(nodes, { width: 80, height: 60 })).toEqual(
      layoutColumns(nodes, { width: 80, height: 60 })
    );
  });
});

describe("flow edge validation (schema-level)", () => {
  it("parseScene rejects orphan edges pointing to the catalog", async () => {
    const { parseScene } = await import("../schema");
    const result = parseScene({
      type: "flow_diagram",
      props: {
        nodes: [{ id: "a", label: "A", col: 0 }],
        edges: [{ from: "a", to: "ghost" }],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toEqual({
        path: "edges[0].to",
        message:
          'references unknown node "ghost" — see docs/guides/scene-catalog.md',
      });
    }
  });

  it("accepts fully connected diagrams", async () => {
    const { parseScene } = await import("../schema");
    const result = parseScene({
      type: "flow_diagram",
      props: {
        nodes: [
          { id: "a", label: "A", col: 0 },
          { id: "b", label: "B", col: 1 },
        ],
        edges: [{ from: "a", to: "b" }],
      },
    });
    expect(result.ok).toBe(true);
  });
});

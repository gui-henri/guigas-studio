// Fixed column-grid layout — pure, declared in props (no DOM measurement,
// no graph library). Nodes sit at grid position (col, index-in-column),
// each column vertically centered.
import type { z } from "zod";
import type { flowDiagramNodeSchema } from "../schema";

export type FlowNode = z.infer<typeof flowDiagramNodeSchema>;

export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  paddingX?: number;
}

export interface LaidOutNode {
  id: string;
  label: string;
  col: number;
  point: Point;
}

/**
 * Positions nodes on a `maxCol+1 × maxPerCol` grid. Columns with fewer nodes
 * are vertically centered. Deterministic; stable ordering within a column.
 */
export function layoutColumns(
  nodes: readonly FlowNode[],
  opts: LayoutOptions
): LaidOutNode[] {
  const { width, height, paddingX = 0 } = opts;
  if (nodes.length === 0) {
    return [];
  }

  const cols = new Map<number, FlowNode[]>();
  for (const node of nodes) {
    const list = cols.get(node.col) ?? [];
    list.push(node);
    cols.set(node.col, list);
  }

  const colIndexes = [...cols.keys()].sort((a, b) => a - b);
  const numCols = Math.max(...colIndexes) + 1;
  const usableW = width - paddingX * 2;
  const cellW = usableW / Math.max(1, numCols);

  const out: LaidOutNode[] = [];
  for (const colIdx of colIndexes) {
    const columnNodes = cols.get(colIdx)!;
    const cellH = height / columnNodes.length;
    columnNodes.forEach((node, row) => {
      out.push({
        id: node.id,
        label: node.label,
        col: node.col,
        point: {
          x: paddingX + cellW * (colIdx + 0.5),
          y: cellH * (row + 0.5),
        },
      });
    });
  }
  return out;
}

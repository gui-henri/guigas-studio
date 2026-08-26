import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { theme } from "../../theme";
import type {
  FlowDiagramScene,
  FlowEdgeInput,
} from "../schema";
import { layoutColumns, type FlowNode } from "./layout";

const NODE_W = 0.16; // fraction of width
const NODE_H = 0.12; // fraction of height

/**
 * Flow diagram with fixed column layout declared in props. Nodes and edges
 * enter alternately (node i, then its outgoing edges), driven purely by
 * useCurrentFrame.
 */
export const FlowDiagram: React.FC<{ scene: FlowDiagramScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const nodes = layoutColumns(scene.props.nodes, { width: 100, height: 100 });
  const points = new Map(nodes.map((n) => [n.id, n.point]));

  // Entrance order: node k appears at frame k*4; edge e at (k+1)*4 right
  // after its source node.
  const nodeAppear = new Map<string, number>(
    scene.props.nodes.map((n: FlowNode, i: number): [string, number] => [n.id, 4 + i * 6])
  );
  const edgeAppear: Array<{ edge: FlowEdgeInput; at: number }> =
    scene.props.edges.map((e: FlowEdgeInput) => ({
      edge: e,
      at: (nodeAppear.get(e.from) ?? 0) + 3,
    }));

  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        background: theme.color.paper,
        padding: "4%",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: "4%", width: "92%", height: "92%" }}
      >
        {edgeAppear.map(({ edge, at }: { edge: FlowEdgeInput; at: number }, idx: number) => {
          if (frame < at) {
            return null;
          }
          const from = points.get(edge.from);
          const to = points.get(edge.to);
          if (!from || !to) {
            return null;
          }
          const midX = (from.x + to.x) / 2;
          const path = `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x - 1}`;
          const draw = interpolate(frame, [at, at + 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <g key={`${edge.from}-${edge.to}-${idx}`}>
              <path
                d={path}
                fill="none"
                stroke={theme.color.muted}
                strokeWidth={0.45}
                strokeDasharray={`${draw * 200} 200`}
                pathLength={200}
              />
              <polygon
                points={`${to.x - 1},${to.y - 1.2} ${to.x - 1},${to.y + 1.2} ${to.x + 0.4},${to.y}`}
                fill={theme.color.muted}
                opacity={draw >= 1 ? 1 : 0}
              />
            </g>
          );
        })}
      </svg>
      {nodes.map((node) => {
        const at = nodeAppear.get(node.id) ?? 0;
        const opacity = interpolate(frame, [at, at + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={node.id}
            style={{
              position: "absolute",
              left: `${node.point.x - NODE_W * 50}%`,
              top: `${node.point.y - NODE_H * 50}%`,
              width: `${NODE_W * 100}%`,
              height: `${NODE_H * 100}%`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: theme.color.surface,
              border: `2px solid ${theme.color.accent}`,
              borderRadius: "0.7vw",
              fontFamily: theme.font.display,
              fontSize: "1.5vw",
              color: theme.color.ink,
              textAlign: "center",
              padding: "0 0.5vw",
              opacity,
            }}
          >
            {node.label}
          </div>
        );
      })}
    </div>
  );
};

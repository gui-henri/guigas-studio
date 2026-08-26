import React from "react";

import { theme } from "../../theme";
import type { DiffViewScene } from "../schema";
import { diffLines, type LineChangeKind, type DiffLine } from "./diff";

const LINE_COLOR: Record<LineChangeKind, string> = {
  context: theme.color.ink,
  added: theme.color.added,
  removed: theme.color.removed,
};

const LINE_GLYPH: Record<LineChangeKind, string> = {
  context: " ",
  added: "+",
  removed: "-",
};

const Panel: React.FC<{
  title: string;
  lines: DiffLine[];
  only?: LineChangeKind;
}> = ({ title, lines, only }) => {
  const shown = only ? lines.filter((l) => l.kind === only) : lines;
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: theme.color.surface,
        border: `1px solid ${theme.color.line}`,
        borderRadius: "0.6vw",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontFamily: theme.font.sans,
          fontSize: "1.05vw",
          fontWeight: 600,
          color: theme.color.ink,
          padding: "0.8vw 1.2vw",
          borderBottom: `1px solid ${theme.color.line}`,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {title}
      </div>
      <pre
        style={{
          margin: 0,
          padding: "1vw 0",
          flex: 1,
          fontFamily: theme.font.mono,
          fontSize: "1.2vw",
          lineHeight: 1.7,
          overflow: "hidden",
        }}
      >
        {shown.map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              color: LINE_COLOR[line.kind],
              background:
                line.kind === "removed"
                  ? "rgba(161, 60, 60, 0.07)"
                  : line.kind === "added"
                    ? "rgba(47, 107, 58, 0.07)"
                    : "transparent",
              padding: "0 1.2vw",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <span
              style={{
                width: "1.4em",
                flexShrink: 0,
                fontWeight: 700,
                userSelect: "none",
              }}
            >
              {LINE_GLYPH[line.kind]}
            </span>
            <span>{line.text}</span>
          </div>
        ))}
      </pre>
    </div>
  );
};

/**
 * Before/after side-by-side panels; before shows only removals, after only
 * additions — the change pops without reading unchanged lines twice.
 */
export const DiffView: React.FC<{ scene: DiffViewScene }> = ({ scene }) => {
  const lines = diffLines(scene.props.before, scene.props.after);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: "2%",
        background: theme.color.paper,
        padding: "4%",
      }}
    >
      {scene.props.title ? (
        <h2
          style={{
            margin: 0,
            fontFamily: theme.font.display,
            fontSize: "2.6vw",
            color: theme.color.ink,
          }}
        >
          {scene.props.title}
        </h2>
      ) : null}
      <div style={{ flex: 1, display: "flex", gap: "3%" }}>
        <Panel
          title="Antes"
          lines={lines}
          only={scene.props.before.length > 0 ? "removed" : undefined}
        />
        <Panel
          title="Depois"
          lines={lines}
          only={scene.props.after.length > 0 ? "added" : undefined}
        />
      </div>
    </div>
  );
};

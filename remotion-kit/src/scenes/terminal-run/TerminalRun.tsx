import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { theme } from "../../theme";
import type { TerminalRunScene } from "../schema";
import { isCursorVisible } from "../code-typing/progress";
import {
  isTyping,
  visibleTerminalLines,
} from "./progress";

const KIND_COLOR = {
  command: theme.color.ink,
  output: theme.color.muted,
  success: theme.color.added,
  error: theme.color.removed,
} as const;

/**
 * Terminal scene: lines reveal strictly as a function of the frame; prompt
 * prefixes command lines; blinking cursor reuses the S4-02 helper.
 */
export const TerminalRun: React.FC<{ scene: TerminalRunScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rendered = visibleTerminalLines(scene.props.lines, frame, fps);
  const typing = isTyping(scene.props.lines, frame, fps);
  const showCursor =
    scene.props.cursor && (typing || isCursorVisible(frame));

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: theme.color.paper,
        padding: "5%",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: theme.color.surface,
          border: `1px solid ${theme.color.line}`,
          borderRadius: "0.7vw",
          overflow: "hidden",
          boxShadow: `0 0.5vw 1.6vw rgba(42, 37, 32, 0.10)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5vw",
            padding: "0.9vw 1.3vw",
            borderBottom: `1px solid ${theme.color.line}`,
            fontFamily: theme.font.sans,
            fontSize: "1vw",
            color: theme.color.muted,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          <span style={{ color: theme.color.removed }}>●</span>
          <span style={{ color: theme.color.accent }}>●</span>
          <span style={{ color: theme.color.added }}>●</span>
          <span style={{ marginLeft: "0.8vw" }}>terminal</span>
        </div>
        <pre
          style={{
            margin: 0,
            padding: "2vw",
            minHeight: "30vh",
            fontFamily: theme.font.mono,
            fontSize: "1.5vw",
            lineHeight: 1.9,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {rendered.map((line, i) => (
            <div key={i} style={{ color: KIND_COLOR[line.kind] }}>
              {line.prompt ? (
                <span style={{ color: theme.color.accent, marginRight: "0.6em" }}>
                  {scene.props.prompt}
                </span>
              ) : null}
              {line.text}
              {showCursor && i === rendered.length - 1 ? (
                <span style={{ color: theme.color.accent }}>▌</span>
              ) : null}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
};

import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { theme } from "../../theme";
import type { CodeTypingScene } from "../schema";
import { tokenizeVisible, type SpanKind } from "./highlight";
import { charsVisible, isCursorVisible } from "./progress";

const SPAN_COLOR: Record<SpanKind, string> = {
  plain: theme.color.ink,
  keyword: theme.color.accent,
  string: theme.color.added,
  comment: theme.color.muted,
  number: theme.color.codeNumber,
  function: theme.color.codeFunction,
};

/**
 * Code typing scene: characters appear frame-by-frame (pure function of the
 * frame), cursor blinks, lightweight highlight over the visible slice only.
 */
export const CodeTyping: React.FC<{ scene: CodeTypingScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const visibleChars = charsVisible(
    frame,
    fps,
    scene.props.code.length,
    scene.props.charsPerSecond
  );
  const spans = tokenizeVisible(scene.props.code, visibleChars);
  const cursorOn = isCursorVisible(frame);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: theme.color.paper,
        padding: "4%",
      }}
    >
      <pre
        style={{
          margin: 0,
          fontFamily: theme.font.mono,
          fontSize: "2.2vw",
          lineHeight: 1.6,
          color: theme.color.ink,
          background: theme.color.surface,
          border: `1px solid ${theme.color.line}`,
          borderRadius: "0.6vw",
          padding: "3%",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          boxShadow: `0 0.4vw 1.2vw rgba(42, 37, 32, 0.08)`,
        }}
      >
        <code>
          {spans.map((span, i) => (
            <span key={i} style={{ color: SPAN_COLOR[span.kind] }}>
              {span.text}
            </span>
          ))}
          {cursorOn ? (
            <span style={{ color: theme.color.accent }}>▌</span>
          ) : null}
        </code>
      </pre>
    </div>
  );
};

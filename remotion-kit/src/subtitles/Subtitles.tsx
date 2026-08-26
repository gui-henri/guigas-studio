import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

import { theme } from "../theme";
import { selectCue, type SubtitleCue as BuiltCue } from "./cues";

export interface SubtitlesProps {
  cues: readonly BuiltCue[];
}

/**
 * EN burn-in subtitles (S4-06): styled with blog tokens, serif, bottom
 * center with a ~10% safety margin. Renders nothing when no cue is active —
 * and the whole component leaves the tree when the toggle is off (S4-05).
 */
export const Subtitles: React.FC<SubtitlesProps> = ({ cues }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  void fps;

  const cue = selectCue(cues, frame);
  if (!cue) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        bottom: height * 0.1,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: theme.font.display,
          fontSize: "2.2vw",
          lineHeight: 1.35,
          color: theme.color.ink,
          textAlign: "center",
          whiteSpace: "pre-line",
          padding: "0.4vw 1.4vw",
          background: "rgba(246, 241, 231, 0.72)",
          borderRadius: "0.5vw",
          textShadow: `0 1px 0 ${theme.color.paper}, 0 -1px 0 ${theme.color.paper}`,
          maxWidth: "84%",
        }}
      >
        {cue.text}
      </div>
    </div>
  );
};

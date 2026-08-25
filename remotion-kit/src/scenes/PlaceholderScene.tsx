import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import type { StudioVideoProps } from "../props";

/**
 * Minimal placeholder scene (S3-06): title + current segment narration with a
 * gentle fade. Replaced by the S4 scene grammar.
 */
export const PlaceholderScene: React.FC<StudioVideoProps> = ({ title, durationMs, script }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const segments = script.segments;
  const count = Math.max(segments.length, 1);
  const segDuration = durationInFrames / count;
  const idx = Math.min(count - 1, Math.floor(frame / Math.max(segDuration, 1)));
  const segment = segments[idx];

  const opacity = interpolate(frame % Math.max(segDuration, 1), [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });
  const totalSeconds = Math.round(durationMs / 1000);

  return (
    <AbsoluteFill style={{ background: "#f6f1e7", color: "#2a2520", padding: 120 }}>
      <h1 style={{ fontFamily: '"Iowan Old Style", Georgia, serif', fontSize: 96 }}>{title}</h1>
      <p style={{ fontFamily: "monospace", fontSize: 40, color: "#b45309" }}>
        {totalSeconds}s · segmento {idx + 1}/{segments.length}
      </p>
      <p style={{ fontFamily: "Georgia, serif", fontSize: 56, marginTop: 48, opacity }}>
        {segment?.narrationPt ?? ""}
      </p>
    </AbsoluteFill>
  );
};

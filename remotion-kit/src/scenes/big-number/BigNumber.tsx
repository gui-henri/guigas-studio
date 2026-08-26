import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { theme } from "../../theme";
import type { BigNumberScene } from "../schema";
import {
  formatNumber,
  splitNumericPrefix,
} from "./format";

/**
 * Big impact number with deterministic count-up over the first second.
 * Non-numeric values render statically (still animated entrance).
 */
export const BigNumber: React.FC<{ scene: BigNumberScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const { numeric, prefix, suffix } = splitNumericPrefix(scene.props.value);
  const display =
    numeric === null
      ? scene.props.value
      : `${prefix}${formatNumber(Math.round(numeric * progress))}${
          progress >= 1 ? suffix : ""
        }`;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2vh",
        background: theme.color.paper,
      }}
    >
      <div
        style={{
          fontFamily: theme.font.display,
          fontSize: "11vw",
          fontWeight: 700,
          color: theme.color.accent,
          lineHeight: 1,
          opacity: progress,
          transform: `scale(${0.92 + progress * 0.08})`,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {display}
      </div>
      <div
        style={{
          fontFamily: theme.font.sans,
          fontSize: "2.2vw",
          fontWeight: 600,
          color: theme.color.ink,
          opacity: interpolate(frame, [10, 25], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {scene.props.label}
      </div>
      {scene.props.context ? (
        <div
          style={{
            fontFamily: theme.font.sans,
            fontSize: "1.5vw",
            color: theme.color.muted,
            opacity: interpolate(frame, [20, 35], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {scene.props.context}
        </div>
      ) : null}
    </div>
  );
};

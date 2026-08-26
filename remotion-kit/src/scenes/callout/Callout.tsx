import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { theme } from "../../theme";
import type { CalloutScene } from "../schema";
import { CalloutIcon, type CalloutIconName } from "./icons";

const VARIANT = {
  info: {
    icon: "info" as CalloutIconName,
    border: theme.color.codeFunction,
    background: "rgba(59, 110, 165, 0.08)",
  },
  warning: {
    icon: "warn" as CalloutIconName,
    border: theme.color.accent,
    background: "rgba(180, 83, 9, 0.08)",
  },
  success: {
    icon: "success" as CalloutIconName,
    border: theme.color.added,
    background: "rgba(47, 107, 58, 0.08)",
  },
  danger: {
    icon: "idea" as CalloutIconName,
    border: theme.color.removed,
    background: "rgba(161, 60, 60, 0.08)",
  },
} as const;

/**
 * Callout scene: variant drives border/background/icon from the tokens.
 * Single deterministic entrance (fade + slide) driven by useCurrentFrame.
 */
export const Callout: React.FC<{ scene: CalloutScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const base = VARIANT[scene.props.variant];
  const iconOverride =
    scene.props.icon !== undefined &&
    ["info", "warn", "success", "idea"].includes(scene.props.icon)
      ? (scene.props.icon as CalloutIconName)
      : undefined;
  const v = iconOverride ? { ...base, icon: iconOverride } : base;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.color.paper,
        padding: "6%",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "2vw",
          alignItems: "flex-start",
          maxWidth: "80%",
          background: v.background,
          border: `2px solid ${v.border}`,
          borderLeftWidth: "0.5vw",
          borderRadius: "0.7vw",
          padding: "3vw",
          opacity: progress,
          transform: `translateY(${(1 - progress) * 24}px)`,
        }}
      >
        <div style={{ color: v.border, flexShrink: 0, paddingTop: "0.3vw" }}>
          <CalloutIcon name={v.icon} />
        </div>
        <div>
          <h2
            style={{
              margin: 0,
              fontFamily: theme.font.display,
              fontSize: "2.4vw",
              color: theme.color.ink,
            }}
          >
            {scene.props.title}
          </h2>
          <p
            style={{
              margin: "1vw 0 0",
              fontFamily: theme.font.sans,
              fontSize: "1.6vw",
              lineHeight: 1.55,
              color: theme.color.muted === "#8a7f72" ? theme.color.ink : theme.color.ink,
            }}
          >
            {scene.props.body}
          </p>
        </div>
      </div>
    </div>
  );
};

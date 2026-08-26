import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { theme } from "../../theme";
import type { TimelineScene } from "../schema";
import { staggerFrames } from "./stagger";

const PER_ITEM = 12; // frames between milestones
const BASE = 6; // frames before the first one

/**
 * Vertical timeline: milestones enter one by one (dot pops, label fades),
 * the connector line grows with the revealed count — pure function of frame.
 */
export const Timeline: React.FC<{ scene: TimelineScene }> = ({ scene }) => {
  const frame = useCurrentFrame();
  const milestones = scene.props.milestones;

  const revealedCount = milestones.filter(
    (_, i) => frame >= staggerFrames(i, PER_ITEM, BASE)
  ).length;

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.color.paper,
      }}
    >
      <div style={{ position: "relative", padding: "2vw 0" }}>
        <div
          style={{
            position: "absolute",
            left: "0.55vw",
            top: "1vw",
            bottom: "1vw",
            width: "0.25vw",
            background: theme.color.line,
          }}
        />
        {revealedCount > 1 ? (
          <div
            style={{
              position: "absolute",
              left: "0.55vw",
              top: "1vw",
              height: `calc(${(revealedCount - 1) / milestones.length} * 88%)`,
              width: "0.25vw",
              background: theme.color.accent,
            }}
          />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: "3vh" }}>
          {milestones.map((m, i) => {
            const at = staggerFrames(i, PER_ITEM, BASE);
            if (frame < at) {
              return null;
            }
            const progress = interpolate(frame, [at, at + 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "1.6vw",
                  opacity: progress,
                  transform: `translateX(${(1 - progress) * -16}px)`,
                }}
              >
                <span
                  style={{
                    width: "1.35vw",
                    height: "1.35vw",
                    borderRadius: "50%",
                    background: theme.color.accent,
                    border: `0.2vw solid ${theme.color.paper}`,
                    boxShadow: `0 0 0 2px ${theme.color.accent}`,
                    flexShrink: 0,
                  }}
                />
                <span>
                  <span
                    style={{
                      fontFamily: theme.font.display,
                      fontSize: "2vw",
                      color: theme.color.ink,
                      display: "block",
                    }}
                  >
                    {m.label}
                  </span>
                  {m.detail ? (
                    <span
                      style={{
                        fontFamily: theme.font.sans,
                        fontSize: "1.3vw",
                        color: theme.color.muted,
                        display: "block",
                      }}
                    >
                      {m.detail}
                    </span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

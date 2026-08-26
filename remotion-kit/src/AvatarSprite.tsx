import React from "react";
import { Img, useCurrentFrame, useVideoConfig } from "remotion";

import { selectBodyState, selectMouthCue } from "./selectors";
import type { TimelineView } from "./selectors";
import { mouthColumnForShape } from "./visemeMap";

export interface SpriteMeta {
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  states: string[];
  mouths: string[];
}

export interface AvatarSpriteProps {
  timeline: TimelineView;
  spriteSheetUrl: string;
  spriteMeta: SpriteMeta;
  /** Rendered size of one sprite cell in px. */
  scale?: number;
  /** Position within the composition frame (px, top-left). */
  position?: { x: number; y: number };
}

/**
 * The avatar rig (S3-07): draws the sprite sheet cell for the current mouth
 * cue + body state. Deterministic — time comes only from the Remotion clock.
 */
export const AvatarSprite: React.FC<AvatarSpriteProps> = ({
  timeline,
  spriteSheetUrl,
  spriteMeta,
  scale = 1080,
  position = { x: 0, y: 0 },
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame * 1000) / fps;

  const cue = selectMouthCue(timeline, ms);
  const state = selectBodyState(timeline, ms);

  const row = Math.max(0, spriteMeta.states.indexOf(state));
  const col = mouthColumnForShape(cue.shape, spriteMeta.mouths);

  // backgroundPosition proportional to the grid cell — regular grid contract.
  const bgWidth = spriteMeta.columns * scale;
  const bgHeight = spriteMeta.rows * scale;
  const posX = -col * scale;
  const posY = -row * scale;

  return (
    <div
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        width: scale,
        height: scale,
        overflow: "hidden",
      }}
    >
      <Img
        src={spriteSheetUrl}
        style={{
          position: "absolute",
          width: bgWidth,
          height: bgHeight,
          left: posX,
          top: posY,
          imageRendering: "auto",
        }}
      />
    </div>
  );
};

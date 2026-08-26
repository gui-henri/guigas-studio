import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";

import type { TimelineView } from "../selectors";
import { AvatarSprite } from "../AvatarSprite";
import type { SpriteMeta } from "../AvatarSprite";

export interface AvatarSegmentSceneProps {
  timeline: TimelineView;
  wavUrl: string;
  spriteSheetUrl: string;
  spriteMeta: SpriteMeta;
  scale?: number;
  position?: { x: number; y: number };
  /** Background color behind the sprite. */
  background?: string;
}

/**
 * Composed segment scene (S3-07 step 4): sprite + audio inside a Sequence so
 * mouth and sound share the exact same clock.
 */
export const AvatarSegmentScene: React.FC<AvatarSegmentSceneProps> = ({
  timeline,
  wavUrl,
  spriteSheetUrl,
  spriteMeta,
  scale,
  position,
  background = "#f6f1e7",
}) => {
  return (
    <AbsoluteFill style={{ background }}>
      <Sequence>
        <Audio src={wavUrl} />
        <AvatarSprite
          timeline={timeline}
          spriteSheetUrl={spriteSheetUrl}
          spriteMeta={spriteMeta}
          scale={scale}
          position={position}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

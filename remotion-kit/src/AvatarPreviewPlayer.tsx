import React from "react";
import { Player } from "@remotion/player";

import type { TimelineView } from "./selectors";
import { AvatarSegmentScene } from "./scenes/AvatarSegmentScene";
import type { SpriteMeta } from "./AvatarSprite";

export interface AvatarPreviewPlayerProps {
  timeline: TimelineView;
  wavUrl: string;
  spriteSheetUrl: string;
  spriteMeta: SpriteMeta;
  scale?: number;
  /** Max css width of the player. */
  maxWidth?: number;
}

/**
 * Ready-made preview player for one segment (S3-08): native controls,
 * responsive bounds; audio + mouth share the Remotion clock.
 */
export const AvatarPreviewPlayer: React.FC<AvatarPreviewPlayerProps> = ({
  timeline,
  wavUrl,
  spriteSheetUrl,
  spriteMeta,
  scale = 900,
  maxWidth = 720,
}) => {
  const durationMs = Number(timeline.durationMs) || 1;
  return (
    <div style={{ maxWidth }}>
      <Player
        component={AvatarSegmentScene as unknown as React.FC<Record<string, unknown>>}
        inputProps={
          { timeline, wavUrl, spriteSheetUrl, spriteMeta, scale } as unknown as Record<string, unknown>
        }
        durationInFrames={Math.max(1, Math.round((durationMs / 1000) * 30))}
        fps={30}
        compositionWidth={1080}
        compositionHeight={1080}
        style={{ width: "100%", aspectRatio: "1080 / 1080" }}
        controls
        acknowledgeRemotionLicense
      />
    </div>
  );
};

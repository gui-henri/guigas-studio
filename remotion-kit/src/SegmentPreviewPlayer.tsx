import React from "react";
import { Player } from "@remotion/player";

import type { SpriteMeta } from "./AvatarSprite";
import type { TimelineView } from "./selectors";
import {
  SegmentComposition,
  type SegmentCompositionProps,
} from "./compositions/SegmentComposition";

export interface SegmentPreviewPlayerProps
  extends Omit<SegmentCompositionProps, "audioSrc" | "avatarTimeline"> {
  /** Parsed avatar timeline; may be null while artifacts load. */
  avatarTimeline: TimelineView | null;
  wavUrl: string | null;
  spriteSheetUrl: string;
  spriteMeta: SpriteMeta;
  /** Max css width of the player container. */
  maxWidth?: number;
}

/**
 * Ready-made preview of ONE segment via the production composition (S4-08):
 * same <SegmentComposition> the runner will render — avatar + scene + audio
 * on a single Remotion clock, native controls, lazy-friendly.
 */
export const SegmentPreviewPlayer: React.FC<SegmentPreviewPlayerProps> = ({
  avatarTimeline: timeline,
  wavUrl,
  spriteSheetUrl,
  spriteMeta,
  maxWidth = 720,
  ...composition
}) => {
  const durationMs = Number(timeline?.durationMs) || 1;
  return (
    <div style={{ maxWidth }}>
      <Player
        component={SegmentComposition as unknown as React.FC<Record<string, unknown>>}
        inputProps={
          {
            ...composition,
            avatarTimeline: timeline,
            audioSrc: wavUrl,
            spriteSheetUrl,
            spriteMeta,
          } as unknown as Record<string, unknown>
        }
        durationInFrames={Math.max(30, Math.round((durationMs / 1000) * 30))}
        fps={30}
        compositionWidth={1280}
        compositionHeight={720}
        style={{ width: "100%", aspectRatio: "1280 / 720" }}
        controls
        acknowledgeRemotionLicense
      />
    </div>
  );
};

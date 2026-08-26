import React from "react";
import { Composition, registerRoot } from "remotion";

import type { TimelineView } from "./selectors";
import { AvatarSegmentScene } from "./scenes/AvatarSegmentScene";
import spriteMeta from "../assets/sprite.json";
import timelineFixture from "../fixtures/timeline.json";

const SpriteStill: React.FC<{ frameMs: number }> = ({ frameMs }) => {
  // Deterministic seek: derive the timeline view at frameMs by slicing cues.
  const tl = sliceAt(timelineFixture, frameMs);
  return (
    <AvatarSegmentScene
      timeline={tl}
      wavUrl=""
      spriteSheetUrl={new URL("../assets/sprite-placeholder.png", import.meta.url).href}
      spriteMeta={{ ...spriteMeta }}
      scale={900}
      position={{ x: 90, y: 90 }}
    />
  );
};

/** Clamp the fixture so selectors see time zeroed at frameMs. */
function sliceAt(tl: TimelineView, ms: number): TimelineView {
  const cue = tl.mouthCues.find(
    (c) => ms >= Number(c.startMs) && ms < Number(c.endMs)
  ) ?? tl.mouthCues[tl.mouthCues.length - 1];
  const st =
    tl.bodyStates.find(
      (s) => ms >= Number(s.startMs) && ms < Number(s.endMs)
    ) ?? tl.bodyStates[tl.bodyStates.length - 1];
  return {
    ...(tl as TimelineView),
    mouthCues: [{ shape: cue.shape, startMs: 0, endMs: Number(cue.endMs) - Number(cue.startMs) }],
    bodyStates: [st],
  };
}

const Root: React.FC = () => (
  <Composition
    id="AvatarStill"
    component={SpriteStill as unknown as React.FC<Record<string, unknown>>}
    durationInFrames={1}
    fps={30}
    width={1080}
    height={1080}
    defaultProps={{ frameMs: 0 }}
    calculateMetadata={({ props }) => ({
      defaultProps: { frameMs: Number((props as { frameMs?: number }).frameMs ?? 0) },
      durationInFrames: 1,
    })}
  />
);

registerRoot(Root);

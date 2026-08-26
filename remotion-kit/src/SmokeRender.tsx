import React from "react";
import { Audio, AbsoluteFill } from "remotion";

import { AvatarSprite } from "./AvatarSprite";
import spriteMeta from "../assets/sprite.json";
import timelineFixture from "../fixtures/timeline.json";
import type { TimelineView } from "./selectors";

const tl = timelineFixture as unknown as TimelineView;

/**
 * 30s smoke composition (S3-09): fixture timeline driving the rig with a
 * synthetic tone in loop — proves CLI rendering end to end.
 */
export const SmokeRender: React.FC = () => (
  <AbsoluteFill style={{ background: "#f6f1e7" }}>
    <Audio src={new URL("../fixtures/tone-30s.wav", import.meta.url).href} />
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <AvatarSprite
        timeline={tl}
        spriteSheetUrl={new URL("../assets/sprite-placeholder.png", import.meta.url).href}
        spriteMeta={{ ...spriteMeta }}
        scale={600}
        position={{ x: 40, y: 60 }}
      />
    </div>
  </AbsoluteFill>
);

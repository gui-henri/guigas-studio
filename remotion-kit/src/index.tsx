import React from "react";
import { create } from "@bufbuild/protobuf";
import { Composition, registerRoot } from "remotion";

import { StudioScriptSchema } from "./gen/app/studio/v1/script_pb";
import type { StudioVideoProps } from "./props";
import { PlaceholderScene } from "./scenes/PlaceholderScene";

const FPS = 30;

const defaultScript = create(StudioScriptSchema, {
  post: "default",
  language: { spoken: "pt-BR", subtitles: "en" },
  target: { durationMin: 8 },
  segments: [],
});

const defaultProps: StudioVideoProps = {
  title: "Guigas Studio",
  durationMs: 30000,
  script: defaultScript,
};

// Remotion's schema-less Composition infers Record<string, unknown>; our
// public typing lives on StudioVideoProps/PlayerHost (proto-derived).
const scene = PlaceholderScene as unknown as React.FC<Record<string, unknown>>;

const Root: React.FC = () => (
  <>
    <Composition
      id="LongForm"
      component={scene}
      durationInFrames={FPS * 30}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const videoProps = props as unknown as StudioVideoProps;
        return {
          durationInFrames: Math.max(
            FPS,
            Math.round((videoProps.durationMs / 1000) * FPS)
          ),
        };
      }}
    />
    <Composition
      id="Short"
      component={scene}
      durationInFrames={FPS * 30}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={defaultProps}
      calculateMetadata={({ props }) => {
        const videoProps = props as unknown as StudioVideoProps;
        return {
          durationInFrames: Math.max(
            FPS,
            Math.round((videoProps.durationMs / 1000) * FPS)
          ),
        };
      }}
    />
  </>
);

registerRoot(Root);

export { PlayerHost } from "./PlayerHost";
export type { PlayerHostProps } from "./PlayerHost";
export type { StudioVideoProps } from "./props";
export { AvatarPreviewPlayer } from "./AvatarPreviewPlayer";
export type { AvatarPreviewPlayerProps } from "./AvatarPreviewPlayer";
export { AvatarSprite } from "./AvatarSprite";
export type { SpriteMeta, AvatarSpriteProps } from "./AvatarSprite";
export type { TimelineView, MouthCue } from "./selectors";

import React from "react";
import { AbsoluteFill, Audio, useVideoConfig } from "remotion";

import { theme } from "../theme";
import { AvatarSprite, type SpriteMeta } from "../AvatarSprite";
import type { TimelineView } from "../selectors";
import {
  parseScene,
  type ParseSceneResult,
  type Scene,
} from "../scenes/schema";
import {
  createSceneResolver,
  defaultSceneRegistry,
  resolveSceneComponent,
} from "./registry";
import { selectLayout } from "./layout";
import { Subtitles } from "../subtitles/Subtitles";
import {
  buildCues,
  type SubtitleWord,
} from "../subtitles/cues";

const AVATAR_SPLIT_FRACTION = 0.4;

export interface SegmentCompositionProps {
  /** Parsed avatar timeline of the segment (S3-04 artifacts). */
  avatarTimeline: TimelineView | null;
  /** Authenticated URL (preview) or staticFile path (render). Never staticFile() here. */
  audioSrc: string | null;
  /**
   * Raw scene envelope `{type, props}` from script.json — parsed here so
   * invalid scenes fail loudly instead of silently rendering nothing.
   */
  scene?: unknown;
  layout?: "fullscreen" | "split" | "overlay";
  showSubtitles?: boolean;
  /** Word timings (S3-05 contract) — converted to frame cues once per mount. */
  subtitleWords?: ReadonlyArray<SubtitleWord>;
  spriteSheetUrl: string;
  spriteMeta: SpriteMeta;
  avatarScale?: number;
  /** Registry override for tests/storybooks; defaults to the full kit. */
  registry?: Partial<typeof defaultSceneRegistry>;
}

const SceneErrorCard: React.FC<{
  issues: Array<{ path: string; message: string }>;
}> = ({ issues }) => (
  <AbsoluteFill
    style={{
      background: theme.color.paper,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: theme.font.mono,
    }}
  >
    <div
      style={{
        border: `2px solid ${theme.color.removed}`,
        borderRadius: "0.6vw",
        padding: "2vw",
        maxWidth: "70%",
      }}
    >
      <div style={{ color: theme.color.removed, fontSize: "1.8vw", fontWeight: 700 }}>
        scene inválida
      </div>
      {issues.map((i, idx) => (
        <div
          key={idx}
          style={{ color: theme.color.ink, fontSize: "1.2vw", marginTop: "0.5vw" }}
        >
          {i.path}: {i.message}
        </div>
      ))}
    </div>
  </AbsoluteFill>
);

/**
 * THE segment composition (SPEC §2 #4): used identically by dashboard preview
 * (Player) and final render (renderMedia). The avatar narrates fullscreen when
 * there is no scene; visuals enter split/overlay only where scenes exist.
 */
export const SegmentComposition: React.FC<SegmentCompositionProps> = ({
  avatarTimeline,
  audioSrc,
  scene,
  layout,
  showSubtitles = false,
  subtitleWords,
  spriteSheetUrl,
  spriteMeta,
  avatarScale = 1080,
  registry,
}) => {
  const { fps } = useVideoConfig();

  if (!avatarTimeline) {
    return <AbsoluteFill style={{ background: theme.color.paper }} />;
  }

  let parsed: ParseSceneResult | null = null;
  if (scene !== undefined && scene !== null) {
    parsed = parseScene(scene);
    if (!parsed.ok) {
      return <SceneErrorCard issues={parsed.issues} />;
    }
  }

  const decision = selectLayout(parsed ? parsed.scene.type : null, layout);
  const resolve = registry
    ? createSceneResolver({ ...defaultSceneRegistry, ...registry })
    : resolveSceneComponent;

  const visual: React.ReactNode = parsed
    ? (() => {
        const typedScene = parsed.scene as Scene;
        const SceneVisual = resolve(typedScene.type);
        return (
          <SceneVisual
            scene={typedScene as never}
            key={typedScene.type}
          />
        );
      })()
    : null;

  const cues = React.useMemo(
    () =>
      showSubtitles && subtitleWords && subtitleWords.length > 0
        ? buildCues(subtitleWords, { fps })
        : [],
    [showSubtitles, subtitleWords, fps]
  );

  const avatar = (
    <AvatarSprite
      timeline={avatarTimeline}
      spriteSheetUrl={spriteSheetUrl}
      spriteMeta={spriteMeta}
      scale={decision.layout === "split" ? avatarScale * AVATAR_SPLIT_FRACTION : avatarScale}
      position={
        decision.layout === "split"
          ? { x: 0, y: (1 - AVATAR_SPLIT_FRACTION) * avatarScale }
          : { x: 0, y: 0 }
      }
    />
  );

  return (
    <AbsoluteFill style={{ background: theme.color.paper }}>
      {audioSrc ? <Audio src={audioSrc} /> : null}

      {decision.layout === "split" ? (
        <div style={{ display: "flex", width: "100%", height: "100%" }}>
          <div
            style={{
              width: `${AVATAR_SPLIT_FRACTION * 100}%`,
              height: "100%",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {avatar}
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            {visual}
          </div>
        </div>
      ) : (
        <>
          {avatar}
          {decision.layout === "overlay" && visual ? (
            <div
              style={{
                position: "absolute",
                right: "4%",
                bottom: "10%",
                width: "46%",
                height: "52%",
                boxShadow: "0 1vw 3vw rgba(42,37,32,0.25)",
                borderRadius: "0.7vw",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {visual}
            </div>
          ) : null}
        </>
      )}

      {showSubtitles ? <Subtitles cues={cues} /> : null}
    </AbsoluteFill>
  );
};

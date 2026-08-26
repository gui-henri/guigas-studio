import React from "react";
import { Composition, registerRoot } from "remotion";

import { SmokeRender } from "./SmokeRender";
import { LongFormVideo } from "./compositions/LongFormVideo";

const FPS = 30;

// Remotion's schema-less Composition infers Record<string, unknown>; our
// public typing lives on StudioVideoProps/PlayerHost (proto-derived).
const longFormScene = LongFormVideo as unknown as React.FC<Record<string, unknown>>;

const Root: React.FC = () => (
  <>
    <Composition
      id="LongForm"
      component={longFormScene}
      durationInFrames={FPS * 30}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ title: "Guigas Studio", segments: [], timelines: {}, audioFiles: {}, spriteSheetUrl: "", spriteMeta: {}, showSubtitles: false, subtitleWordsBySeg: {} } as unknown as Record<string, never>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as {
          segments?: Array<{ id: string }>;
          timelines?: Record<string, { durationMs?: number }>;
        };
        const totalMs = (p.segments ?? []).reduce(
          (sum, s) => sum + (Number(p.timelines?.[s.id]?.durationMs ?? 0) || 1000),
          0
        );
        return { durationInFrames: Math.max(FPS, Math.round((totalMs / 1000) * FPS)) };
      }}
    />
    <Composition
      id="Short"
      component={longFormScene}
      durationInFrames={FPS * 30}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ title: "Guigas Studio", segments: [], timelines: {}, audioFiles: {}, spriteSheetUrl: "", spriteMeta: {}, showSubtitles: false, subtitleWordsBySeg: {} } as unknown as Record<string, never>}
      calculateMetadata={({ props }) => {
        const p = props as unknown as {
          segments?: Array<{ id: string }>;
          timelines?: Record<string, { durationMs?: number }>;
        };
        const totalMs = (p.segments ?? []).reduce(
          (sum, s) => sum + (Number(p.timelines?.[s.id]?.durationMs ?? 0) || 1000),
          0
        );
        return { durationInFrames: Math.max(FPS, Math.round((totalMs / 1000) * FPS)) };
      }}
    />
    <Composition
      id="SmokeRender"
      component={SmokeRender as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={30 * FPS}
      fps={FPS}
      width={1280}
      height={720}
      defaultProps={{}}
    />
  </>
);

registerRoot(Root);
export { PlayerHost } from "./PlayerHost";
export type { PlayerHostProps } from "./PlayerHost";
export type { StudioVideoProps } from "./props";
export { AvatarPreviewPlayer } from "./AvatarPreviewPlayer";
export type { AvatarPreviewPlayerProps } from "./AvatarPreviewPlayer";
export { SegmentPreviewPlayer } from "./SegmentPreviewPlayer";
export type { SegmentPreviewPlayerProps } from "./SegmentPreviewPlayer";
export { AvatarSprite } from "./AvatarSprite";
export type { SpriteMeta, AvatarSpriteProps } from "./AvatarSprite";
export type { TimelineView, MouthCue } from "./selectors";

export { SmokeRender } from "./SmokeRender";
export { CodeTyping } from "./scenes/code-typing/CodeTyping";
export { DiffView } from "./scenes/diff-view/DiffView";
export { TerminalRun } from "./scenes/terminal-run/TerminalRun";
export { Callout } from "./scenes/callout/Callout";
export { FlowDiagram } from "./scenes/flow-diagram/FlowDiagram";
export { BigNumber } from "./scenes/big-number/BigNumber";
export { Timeline } from "./scenes/timeline/Timeline";
export { SegmentComposition, type SegmentCompositionProps } from "./compositions/SegmentComposition";
export {
  LongFormVideo,
  type LongFormProps,
  type LongFormSegmentInput,
} from "./compositions/LongFormVideo";
export { selectLayout, type SegmentLayout } from "./compositions/layout";
export { Subtitles, type SubtitlesProps } from "./subtitles/Subtitles";
export {
  buildCues,
  selectCue,
  type SubtitleCue,
  type SubtitleWord,
} from "./subtitles/cues";
export {
  createSceneResolver,
  defaultSceneRegistry,
  resolveSceneComponent,
  type SceneComponent,
  type SceneRegistry,
} from "./compositions/registry";
export {
  parseScene,
  sceneSchema,
  type Scene,
  type SceneType,
  type ParseSceneResult,
  type SceneParseIssue,
  type CodeTypingScene,
  type DiffViewScene,
  type TerminalRunScene,
  type FlowDiagramScene,
  type BigNumberScene,
  type TimelineScene,
  type CalloutScene,
  type TerminalLine,
  type FlowNodeInput,
  type FlowEdgeInput,
} from "./scenes/schema";
export { theme } from "./theme";

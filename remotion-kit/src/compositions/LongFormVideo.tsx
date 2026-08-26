import React from "react";
import {
  AbsoluteFill,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import type { TimelineView } from "../selectors";
import { SegmentComposition } from "./SegmentComposition";

// Resolves a media reference: absolute/http/blob/data URLs pass through;
// bare relative paths resolve against the render publicDir (runner) — in the
// SPA the caller passes full URLs already, so this is a no-op there.
function resolveMediaUrl(ref: string): string {
  if (
    ref.startsWith("http://") ||
    ref.startsWith("https://") ||
    ref.startsWith("blob:") ||
    ref.startsWith("data:")
  ) {
    return ref;
  }
  return staticFile(ref);
}

export interface LongFormSegmentInput {
  id: string;
  /** Raw scene envelope from script.json; null = avatar-only segment. */
  scene?: unknown | null;
}

export interface LongFormProps {
  title: string;
  segments: LongFormSegmentInput[];
  timelines: Record<string, unknown>;
  audioFiles: Record<string, string>;
  spriteSheetUrl: string;
  spriteMeta: Record<string, unknown>;
  showSubtitles: boolean;
  subtitleWordsBySeg: Record<
    string,
    Array<{ text: string; startMs: number; endMs: number }>
  >;
}

const SPRITE_SCALE = 1080;

/**
 * Full long-form composition (S5-05): stitches every approved segment in
 * script order onto ONE clock. Each segment is a <Sequence> wrapping THE
 * SegmentComposition used by preview — preview and final cut cannot drift.
 * Per-segment <Audio> lives inside its sequence, so windows never overlap.
 */
export const LongFormVideo: React.FC<LongFormProps> = ({
  title,
  segments,
  timelines,
  audioFiles,
  spriteSheetUrl,
  spriteMeta,
  showSubtitles,
  subtitleWordsBySeg,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const sheetUrl = resolveMediaUrl(spriteSheetUrl);

  let offsetFrames = 0;
  const pieces = segments.map((segment) => {
    const timeline = timelines[segment.id] as TimelineView | undefined;
    const durationMs = Number(timeline?.durationMs ?? 0) || 1;
    const segFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
    const piece = {
      segment,
      timeline,
      segFrames,
      offsetFrames,
      wavRef: audioFiles[segment.id] ?? "",
      words: subtitleWordsBySeg[segment.id] ?? [],
    };
    offsetFrames += segFrames;
    return piece;
  });

  return (
    <AbsoluteFill style={{ background: "#f6f1e7" }}>
      {pieces.map((piece) =>
        piece.timeline ? (
          <Sequence
            key={piece.segment.id}
            from={piece.offsetFrames}
            durationInFrames={piece.segFrames}
          >
            <SegmentComposition
              avatarTimeline={piece.timeline as never}
              audioSrc={piece.wavRef ? resolveMediaUrl(piece.wavRef) : null}
              scene={piece.segment.scene ?? null}
              layout="split"
              showSubtitles={showSubtitles && piece.words.length > 0}
              subtitleWords={piece.words}
              spriteSheetUrl={sheetUrl}
              spriteMeta={spriteMeta as never}
              avatarScale={SPRITE_SCALE}
            />
          </Sequence>
        ) : null
      )}

      {frame < fps ? (
        <div
          style={{
            position: "absolute",
            top: "6%",
            left: 0,
            right: 0,
            textAlign: "center",
            fontFamily: '"Iowan Old Style", Georgia, serif',
            fontSize: "3vw",
            color: "#2a2520",
            opacity: 1 - frame / fps,
          }}
        >
          {title}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

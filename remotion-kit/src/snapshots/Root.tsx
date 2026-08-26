import React from "react";
import { Composition } from "remotion";

// Snapshot-only entry (S4-09): isolated from the preview/render root on
// purpose — these compositions exist solely for visual regression stills.

import codeTypingFixture from "../../fixtures/code-typing.json";
import diffViewFixture from "../../fixtures/diff-view.json";
import terminalRunFixture from "../../fixtures/terminal-run.json";
import flowDiagramFixture from "../../fixtures/flow-diagram.json";
import bigNumberFixture from "../../fixtures/big-number.json";
import timelineSceneFixture from "../../fixtures/scene-timeline.json";
import calloutInfoFixture from "../../fixtures/callout-info.json";
import { CodeTyping } from "../scenes/code-typing/CodeTyping";
import { DiffView } from "../scenes/diff-view/DiffView";
import { TerminalRun } from "../scenes/terminal-run/TerminalRun";
import { FlowDiagram } from "../scenes/flow-diagram/FlowDiagram";
import { BigNumber } from "../scenes/big-number/BigNumber";
import { Timeline } from "../scenes/timeline/Timeline";
import { Callout } from "../scenes/callout/Callout";

const FPS = 30;
const WIDTH = 960;
const HEIGHT = 540;

type AnyComp = React.FC<Record<string, unknown>>;

const Snap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: "flex", width: "100%", height: "100%" }}>{children}</div>
);

const SnapRoot: React.FC = () => (
  <>
    <Composition
      id="snap-code-typing"
      component={(() => {
        const C: React.FC = () => (
          <Snap>
            {/* frame 30 @30fps ≈ 1s → mid-typing (partial reveal + cursor) */}
            <CodeTyping scene={codeTypingFixture as never} />
          </Snap>
        );
        return C as unknown as AnyComp;
      })()}
      durationInFrames={FPS * 4}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="snap-diff-view"
      component={(() => {
        const C: React.FC = () => (
          <Snap>
            <DiffView scene={diffViewFixture as never} />
          </Snap>
        );
        return C as unknown as AnyComp;
      })()}
      durationInFrames={FPS * 4}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="snap-terminal-run"
      component={(() => {
        const C: React.FC = () => (
          <Snap>
            <TerminalRun scene={terminalRunFixture as never} />
          </Snap>
        );
        return C as unknown as AnyComp;
      })()}
      durationInFrames={FPS * 6}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="snap-flow-diagram"
      component={(() => {
        const C: React.FC = () => (
          <Snap>
            <FlowDiagram scene={flowDiagramFixture as never} />
          </Snap>
        );
        return C as unknown as AnyComp;
      })()}
      durationInFrames={FPS * 5}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="snap-big-number"
      component={(() => {
        const C: React.FC = () => (
          <Snap>
            <BigNumber scene={bigNumberFixture as never} />
          </Snap>
        );
        return C as unknown as AnyComp;
      })()}
      durationInFrames={FPS * 3}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="snap-timeline"
      component={(() => {
        const C: React.FC = () => (
          <Snap>
            <Timeline scene={timelineSceneFixture as never} />
          </Snap>
        );
        return C as unknown as AnyComp;
      })()}
      durationInFrames={FPS * 5}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="snap-callout"
      component={(() => {
        const C: React.FC = () => (
          <Snap>
            <Callout scene={calloutInfoFixture as never} />
          </Snap>
        );
        return C as unknown as AnyComp;
      })()}
      durationInFrames={FPS * 3}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);

export { SnapRoot };

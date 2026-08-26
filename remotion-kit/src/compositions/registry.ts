// Registry mapping scene types to components (S4-05). Swapping a component
// here never touches the compositor. A missing entry is an explicit error at
// resolve time — never a blank screen.
import type { ComponentType } from "react";

import type { Scene, SceneType } from "../scenes/schema";
import { CodeTyping } from "../scenes/code-typing/CodeTyping";
import { DiffView } from "../scenes/diff-view/DiffView";
import { TerminalRun } from "../scenes/terminal-run/TerminalRun";
import { FlowDiagram } from "../scenes/flow-diagram/FlowDiagram";
import { BigNumber } from "../scenes/big-number/BigNumber";
import { Timeline } from "../scenes/timeline/Timeline";
import { Callout } from "../scenes/callout/Callout";

export type SceneComponent<T extends SceneType = SceneType> = ComponentType<{
  scene: Extract<Scene, { type: T }>;
}>;

type RegistryMap = {
  [K in SceneType]: ComponentType<{ scene: Extract<Scene, { type: K }> }>;
};

export type SceneRegistry = RegistryMap;

export const defaultSceneRegistry: SceneRegistry = {
  code_typing: CodeTyping,
  diff_view: DiffView,
  terminal_run: TerminalRun,
  flow_diagram: FlowDiagram,
  big_number: BigNumber,
  timeline: Timeline,
  callout: Callout,
};

export function createSceneResolver(
  registry: Partial<SceneRegistry>
): (type: SceneType) => SceneComponent<SceneType> {
  return (type) => {
    const component = registry[type as keyof RegistryMap] as
      | ComponentType<{ scene: Scene }>
      | undefined;
    if (!component) {
      throw new Error(
        `scene type "${type}" has no registered component — add it to compositions/registry.ts`
      );
    }
    return component as SceneComponent;
  };
}

export const resolveSceneComponent = createSceneResolver(defaultSceneRegistry);

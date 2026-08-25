import React from "react";
import { Player } from "@remotion/player";

import type { StudioVideoProps } from "./props";
import { PlaceholderScene } from "./scenes/PlaceholderScene";

export interface PlayerHostProps {
  /** Which registered composition to play. */
  compositionId?: "LongForm" | "Short";
  props: StudioVideoProps;
  /** Max css width of the player container. */
  maxWidth?: number;
}

interface PlayerHostState {
  error: Error | null;
}

/**
 * Typed <Player> wrapper for the SPA (T-02): responsive, bounded dimensions,
 * error boundary, no data fetching — everything arrives via props.
 */
export class PlayerHost extends React.Component<PlayerHostProps, PlayerHostState> {
  state: PlayerHostState = { error: null };

  static getDerivedStateFromError(error: Error): PlayerHostState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 16, border: "1px solid #fca5a5", background: "#fef2f2" }}>
          <strong>Player falhou:</strong> {this.state.error.message}
        </div>
      );
    }
    const { compositionId = "LongForm", props, maxWidth = 960 } = this.props;
    const isVertical = compositionId === "Short";
    const width = 1920;
    const height = isVertical ? 1920 : 1080;
    const durationInFrames = Math.max(30, Math.round((props.durationMs / 1000) * 30));

    return (
      <div style={{ maxWidth }}>
        <Player
          component={PlaceholderScene as unknown as React.FC<Record<string, unknown>>}
          inputProps={props as unknown as Record<string, unknown>}
          durationInFrames={durationInFrames}
          fps={30}
          compositionWidth={width}
          compositionHeight={height}
          style={{ width: "100%", aspectRatio: `${width} / ${height}` }}
          controls
          acknowledgeRemotionLicense
        />
      </div>
    );
  }
}

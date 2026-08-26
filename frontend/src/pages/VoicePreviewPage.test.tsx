// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const videoFixture = {
  video: { id: "vid-1", slug: "demo", status: "VOICE_PROCESSING" },
  script: {
    segments: [
      { id: "hook", beat: 1, emotion: 1, narrationPt: "Gancho" },
      { id: "cta", beat: 5, emotion: 1, narrationPt: "CTA" },
    ],
  },
};

vi.mock("@connectrpc/connect-query", () => ({
  useQuery: vi.fn((method: { kind?: string }) => {
    if (method?.kind === "listTakes") {
      return { data: { takes: fakeTakes }, isLoading: false, error: undefined, refetch: vi.fn() };
    }
    return { data: videoFixture, isLoading: false, error: undefined, refetch: vi.fn() };
  }),
}));

vi.mock("../gen/app/studio/v1/video-VideoService_connectquery", () => ({
  getVideo: {},
  listTakes: { kind: "listTakes" },
}));

let fakeTakes: Array<{ segmentId: string; kind: string }> = [];

vi.mock("../hooks/useSegmentAssets", () => ({
  useSegmentAssets: (_v: string, segmentId: string) => {
    const hasTimeline = fakeTakes.some((t) => t.segmentId === segmentId && t.kind === "audio");
    return {
      wavUrl: hasTimeline ? "blob:x" : null,
      timelineJson: hasTimeline ? JSON.stringify({ version: 1, durationMs: 1000, mouthCues: [], bodyStates: [] }) : null,
      loading: false,
    };
  },
}));

// Player is heavy in jsdom — stub the preview player.
vi.mock("@guigas/remotion-kit", async () => {
  const React = await import("react");
  return {
    AvatarPreviewPlayer: () => React.createElement("div", { "data-testid": "player" }, "player"),
    __esModule: true,
  };
});

import VoicePreviewPage from "./VoicePreviewPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/videos/vid-1/voice"]}>
      <VoicePreviewPage />
    </MemoryRouter>
  );
}

describe("VoicePreviewPage", () => {
  beforeEach(() => {
    cleanup();
    fakeTakes = [];
    window.history.replaceState({}, "", "/videos/vid-1/voice");
  });

  it("shows empty state and hides player when no segment is ready", () => {
    renderPage();
    expect(screen.getAllByText(/processando…/).length).toBe(2);
    expect(screen.getByText(/Nenhum segmento com take/i)).toBeTruthy();
    expect(screen.queryByTestId("player")).toBeNull();
  });

  it("lists ready segments and shows the player for the selected one", () => {
    fakeTakes = [{ segmentId: "hook", kind: "audio" }];
    // useSegmentAssets returns assets only when the hook's segmentId matches;
    // default selection picks the first ready segment ("hook").
    renderPage();
    expect(screen.getByText("✓ pronto")).toBeTruthy();
    expect(screen.getByTestId("player")).toBeTruthy();
    expect(screen.queryByText(/Nenhum segmento com take/i)).toBeNull();
  });
});

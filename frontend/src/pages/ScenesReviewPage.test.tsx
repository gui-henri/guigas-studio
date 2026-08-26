// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const segmentsFixture = [
  {
    id: "hook",
    narrationPt: "Gancho forte",
    scene: { type: "code_typing", props: { code: "let x = 1;" } },
  },
  {
    id: "body",
    narrationPt: "Explicação",
    scene: null,
  },
];

let fakeStatus: number = VideoStatus.SCENES_REVIEW;

vi.mock("@connectrpc/connect-query", () => ({
  useQuery: vi.fn((method: { kind?: string }) => {
    if (method?.kind === "listTakes") {
      return { data: { takes: [] }, isLoading: false };
    }
    return {
      data: {
        video: {
          id: "vid-1",
          slug: "demo",
          status: fakeStatus,
          updatedAt: "2026-01-01T00:00:00Z",
        },
        script: { segments: segmentsFixture },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    };
  }),
}));

vi.mock("../gen/app/studio/v1/video-VideoService_connectquery", () => ({
  getVideo: {},
  listTakes: { kind: "listTakes" },
}));

import { VideoStatus } from "../gen/app/studio/v1/video_pb";

vi.mock("../hooks/useSegmentAssets", () => ({
  useSegmentAssets: () => ({
    wavUrl: null,
    timelineJson: JSON.stringify({
      version: 1,
      segmentId: "x",
      durationMs: 1000,
      mouthCues: [],
      bodyStates: [],
    }),
    loading: false,
  }),
}));

vi.mock("../hooks/useInView", () => ({
  useInView: () => ({ ref: { current: null }, inView: true }),
}));

vi.mock("@guigas/remotion-kit", async () => {
  const React = await import("react");
  return {
    SegmentPreviewPlayer:
      (props: Record<string, unknown>) =>
        React.createElement(
          "div",
          { "data-testid": "preview-player", "data-scene": String(props.scene !== null) },
          "player"
        ),
    SpriteMeta: {},
  } as never;
});

vi.mock("@guigas/remotion-kit/assets/sprite.json", () => ({ default: {} }));
vi.mock("@guigas/remotion-kit/assets/sprite-placeholder.png", () => ({ default: "" }));

import ScenesReviewPage from "./ScenesReviewPage";

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/videos/vid-1/scenes"]}>
        <ScenesReviewPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ScenesReviewPage", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    fakeStatus = VideoStatus.SCENES_REVIEW;
  });

  it("renders avatar-only and technical cards with badges", () => {
    renderPage();
    const cards = screen.getAllByTestId("scene-card");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("code_typing")).toBeTruthy();
    expect(screen.getByText("só avatar")).toBeTruthy();
  });

  it("blocks approve-all until every card is approved; decisions persist", () => {
    renderPage();
    const approveAll = screen.getByTestId("approve-all") as HTMLButtonElement;
    expect(approveAll.disabled).toBe(true);

    // Approve both cards via their Aprovar buttons.
    const buttons = screen.getAllByText("Aprovar") as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);

    expect(screen.getByTestId("review-progress").textContent).toBe(
      "2/2 aprovadas"
    );
    expect(approveAll.disabled).toBe(false);

    // Decisions survive reload (localStorage draft).
    const raw = localStorage.getItem(
      "guigas.scenes-review.demo.v2026-01-01T00:00:00Z"
    );
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.hook.decision).toBe("approved");
  });

  it("reject requires a comment and enables copy-prompt afterwards", () => {
    renderPage();
    // Enter reject mode on the first card.
    fireEvent.click(screen.getAllByText("Reprovar")[0]);
    const confirm = screen.getByText("Confirmar reprovação") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // no comment yet

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "corte o código" },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    expect(screen.getByTestId("copy-prompt")).toBeTruthy();
    expect(screen.getByTestId("review-progress").textContent).toBe("0/2 aprovadas");
  });

  it("disables actions outside scenes_review", () => {
    fakeStatus = VideoStatus.RECORDING;
    renderPage();
    expect(screen.queryAllByText("Aprovar")).toHaveLength(0);
    expect((screen.getByTestId("approve-all") as HTMLButtonElement).disabled).toBe(true);
  });
});

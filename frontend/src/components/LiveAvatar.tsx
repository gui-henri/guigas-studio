import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import {
  loadSpriteSheet,
  rowForState,
  type SpriteSheet,
} from "../recording/spriteSheet";
import type { MouthShape, SpriteState } from "../recording/stateMapping";

export interface LiveAvatarProps {
  /** Latest detected state; read via ref inside the rAF loop (no re-renders). */
  stateRef: RefObject<SpriteState>;
  /** Optional latest detected mouth shape; drives live articulation. */
  mouthRef?: RefObject<MouthShape>;
  mirror?: boolean;
  scale?: number; // css px, clamped 96–720
  demo?: boolean; // cycle all 5 states every 800ms (dev without webcam)
}

const DEMO_CYCLE: SpriteState[] = [
  "idle",
  "talking",
  "happy",
  "thoughtful",
  "surprised",
];

const MOUTH_COL_MAP: Record<string, number> = {
  rest: 0,
  open_a: 1,
  rounded_o: 2,
  wide_e: 3,
};

/**
 * Canvas preview of the sprite sheet that mirrors both body state and
 * real-time mouth articulation (visemes/shapes) live during recording.
 */
export default function LiveAvatar({
  stateRef,
  mouthRef,
  mirror = true,
  scale = 320,
  demo = false,
}: LiveAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheetRef = useRef<SpriteSheet | null>(null);
  const lastCellRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let demoTimer: ReturnType<typeof setInterval> | null = null;
    let demoIdx = 0;

    void loadSpriteSheet().then((sheet) => {
      if (cancelled) return;
      sheetRef.current = sheet;
    });

    const clamp = (v: number) => Math.min(720, Math.max(96, v));
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const sheet = sheetRef.current;
      if (!canvas || !sheet) return;

      const size = clamp(scale);
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1)) * 2;
      if (canvas.width !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (demo) {
        if (demoTimer === null) {
          demoTimer = setInterval(() => {
            demoIdx = (demoIdx + 1) % DEMO_CYCLE.length;
            lastCellRef.current = ""; // force redraw on next frame
          }, 800);
        }
      } else if (demoTimer !== null) {
        clearInterval(demoTimer);
        demoTimer = null;
      }

      const activeState: string = demo
        ? DEMO_CYCLE[demoIdx]
        : (stateRef.current ?? "idle");
      const activeMouth: string = demo
        ? ["rest", "open_a", "rounded_o", "wide_e"][demoIdx % 4]
        : (mouthRef?.current ?? "rest");

      const row = rowForState(sheet, activeState);
      const col = MOUTH_COL_MAP[activeMouth] ?? 0;
      const cellKey = `${activeState}/${row}/${col}/${mirror}/${canvas.width}`;
      if (cellKey === lastCellRef.current) return; // nothing changed this frame
      lastCellRef.current = cellKey;

      ctx.imageSmoothingEnabled = false; // crisp pixel-art placeholder
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      if (mirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      const cell = sheet.cellWidth;
      ctx.drawImage(
        sheet.img,
        col * cell,
        row * cell,
        cell,
        cell,
        0,
        0,
        canvas.width,
        canvas.height
      );
      ctx.restore();
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (demoTimer !== null) clearInterval(demoTimer);
    };
  }, [demo, mirror, mouthRef, scale, stateRef]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Avatar ao vivo"
      className="rounded-lg border border-border"
    />
  );
}

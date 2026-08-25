// Sprite sheet loading per the S0-13 contract (sprite.json drives everything).
// The PNG/JSON are the exact files remotion-kit uses — imported statically so
// Vite fingerprints them into the bundle.
import spriteMeta from "../../../remotion-kit/assets/sprite.json";
import sheetUrl from "../../../remotion-kit/assets/sprite-placeholder.png";

export interface SpriteSheet {
  img: HTMLImageElement;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  states: string[];
  mouths: string[];
}

let cached: Promise<SpriteSheet> | null = null;

/** Load (and memoize) the placeholder sprite sheet + its metadata. */
export function loadSpriteSheet(): Promise<SpriteSheet> {
  if (cached) return cached;
  cached = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        img,
        cellWidth: spriteMeta.cellWidth,
        cellHeight: spriteMeta.cellHeight,
        columns: spriteMeta.columns,
        rows: spriteMeta.rows,
        states: [...spriteMeta.states],
        mouths: [...spriteMeta.mouths],
      });
    img.onerror = () => reject(new Error("failed to load sprite sheet PNG"));
    img.src = sheetUrl;
  });
  return cached;
}

/** Row index for a state name (contract order), or 0 when unknown. */
export function rowForState(sheet: SpriteSheet, state: string): number {
  const idx = sheet.states.indexOf(state);
  return idx >= 0 ? idx : 0;
}

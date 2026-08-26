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

const STATE_ROW_MAP: Record<string, number> = {
  idle: 0,
  neutro: 0,
  falando: 1,
  talking: 1,
  speech: 1,
  feliz: 2,
  happy: 2,
  smile: 2,
  sorriso: 2,
  pensativo: 3,
  thoughtful: 3,
  thinking: 3,
  surpreso: 4,
  surprised: 4,
};

/** Row index for a state name (contract order), or 0 when unknown. */
export function rowForState(sheet: SpriteSheet, state: string): number {
  if (state in STATE_ROW_MAP) {
    return STATE_ROW_MAP[state];
  }
  const idx = sheet.states.indexOf(state);
  return idx >= 0 ? idx : 0;
}

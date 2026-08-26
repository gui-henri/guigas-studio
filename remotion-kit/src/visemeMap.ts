// Rhubarb shape → sprite mouth column name (contract: sprite.json mouths[]).
// X/silence falls on the closed-mouth column.
const SHAPE_TO_MOUTH: Record<string, string> = {
  A: "open_a",
  B: "open_a",
  C: "rounded_o",
  D: "rounded_o",
  E: "wide_e",
  F: "wide_e",
  G: "wide_e",
  H: "rest",
  X: "rest",
};

export function mouthColumnForShape(shape: string, mouths: string[]): number {
  const target = SHAPE_TO_MOUTH[shape] ?? "rest";
  const idx = mouths.indexOf(target);
  return idx >= 0 ? idx : 0;
}

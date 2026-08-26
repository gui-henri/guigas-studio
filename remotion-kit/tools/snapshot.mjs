// Visual regression driver (S4-09): renders one still per scene component at
// a representative frame, then pixel-compares against committed baselines.
// Usage:
//   node tools/snapshot.mjs            # compare (exit 1 on divergence)
//   node tools/snapshot.mjs --update   # regenerate baselines
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PNG = (await import("pngjs")).PNG;
const pixelmatch = (await import("pixelmatch")).default;

const ENTRY = "src/snapshots/index.ts";
const BASELINE_DIR = "__snapshots__/baseline";
const TMP_DIR = "__snapshots__/.rendered";
const TOLERANCE = Number(process.env.SNAPSHOT_TOLERANCE ?? "0.005"); // max fraction of pixels allowed to differ

// Representative frames — deliberately mid-animation so timing bugs surface.
const SNAPS = [
  ["snap-code-typing", 30],
  ["snap-diff-view", 20],
  ["snap-terminal-run", 90],
  ["snap-flow-diagram", 40],
  ["snap-big-number", 45],
  ["snap-timeline", 50],
  ["snap-callout", 30],
];

const UPDATE = process.argv.includes("--update");
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(BASELINE_DIR, { recursive: true });

function renderStill(id, frame) {
  const out = path.join(TMP_DIR, `${id}.png`);
  const r = spawnSync(
    "npx",
    ["remotion", "still", ENTRY, id, out, `--frame=${frame}`, "--log=error"],
    { stdio: "inherit", shell: true }
  );
  if (r.status !== 0) throw new Error(`remotion still failed for ${id}`);
  return out;
}

function compare(baselinePath, renderedPath) {
  const a = PNG.sync.read(fs.readFileSync(baselinePath));
  const b = PNG.sync.read(fs.readFileSync(renderedPath));
  if (a.width !== b.width || a.height !== b.height) {
    return { diffPixels: -1, total: a.width * a.height };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: 0.1,
  });
  return { diffPixels, total: a.width * a.height };
}

const failures = [];
for (const [id, frame] of SNAPS) {
  const rendered = renderStill(id, frame);
  const baseline = path.join(BASELINE_DIR, `${id}.png`);

  if (UPDATE || !fs.existsSync(baseline)) {
    fs.copyFileSync(rendered, baseline);
    console.log(`baseline ${UPDATE ? "updated" : "created"}: ${baseline}`);
    continue;
  }

  const { diffPixels, total } = compare(baseline, rendered);
  const ratio = diffPixels < 0 ? 1 : diffPixels / total;
  if (ratio > TOLERANCE) {
    failures.push(`${id}: ${(ratio * 100).toFixed(2)}% divergent (> ${(TOLERANCE * 100).toFixed(1)}%)`);
  } else {
    console.log(`ok ${id} (${(ratio * 100).toFixed(2)}% divergent)`);
  }
}

if (failures.length > 0) {
  console.error(`\nSNAPSHOT FAILURES:\n${failures.map((f) => `  - ${f}`).join("\n")}`);
  console.error("Intentional change? run: npm run snapshots:update -w remotion-kit");
  process.exit(1);
}
console.log("SNAPSHOTS OK");

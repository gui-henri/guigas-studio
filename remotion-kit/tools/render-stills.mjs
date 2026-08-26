// Renders keyframes of the avatar rig for visual inspection (S3-07 step 7).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const KEY_FRAMES = [
  { name: "start-idle", ms: 100 },
  { name: "mid-speech", ms: 600 },
  { name: "state-change", ms: 1300 },
  { name: "silence", ms: 2500 },
];

fs.mkdirSync("out", { recursive: true });
let failed = false;
for (const kf of KEY_FRAMES) {
  const propsFile = path.join("out", `props-${kf.name}.json`);
  fs.writeFileSync(propsFile, JSON.stringify({ frameMs: kf.ms }));
  const r = spawnSync("npx", [
    "remotion", "still", "src/stills.tsx", "AvatarStill",
    `out/avatar-${kf.name}.png`, `--props=${propsFile}`, "--log=error",
  ], { stdio: "inherit", shell: true });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);

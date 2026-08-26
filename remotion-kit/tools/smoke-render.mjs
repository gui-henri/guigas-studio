// Cross-platform smoke render driver (S3-09): spawns the Remotion CLI with
// explicit args and writes out/smoke-30s.mp4.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

fs.mkdirSync("out", { recursive: true });
const r = spawnSync("npx", [
  "remotion", "render", "src/index.tsx", "SmokeRender",
  "out/smoke-30s.mp4", "--log=error",
], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);

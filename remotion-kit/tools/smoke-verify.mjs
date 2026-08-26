// Validates the smoke render output: existence, minimum size, ~30s duration
// parsed from the MP4 mvhd box (no external ffmpeg dependency).
import fs from "node:fs";

const path = new URL("../out/smoke-30s.mp4", import.meta.url);
if (!fs.existsSync(path)) {
  console.error("smoke-30s.mp4 not found — run npm run smoke:render first");
  process.exit(1);
}
const buf = fs.readFileSync(path);
if (buf.length < 100_000) {
  console.error(`file suspiciously small: ${buf.length} bytes`);
  process.exit(1);
}

// Find mvhd box and read timescale/duration.
const idx = buf.indexOf(Buffer.from("mvhd"));
if (idx < 0) {
  console.error("mvhd box not found (not a valid MP4?)");
  process.exit(1);
}
const version = buf.readUInt8(idx + 4);
let timescale, duration;
if (version === 0) {
  timescale = buf.readUInt32BE(idx + 16);
  duration = buf.readUInt32BE(idx + 20);
} else {
  timescale = Number(buf.readBigUInt64BE(idx + 24));
  duration = Number(buf.readBigUInt64BE(idx + 32));
}
const seconds = duration / timescale;

console.log(`size=${buf.length}B duration=${seconds.toFixed(2)}s`);
if (seconds < 28 || seconds > 32) {
  console.error(`duration ${seconds.toFixed(2)}s outside expected ~30s window`);
  process.exit(1);
}
console.log("SMOKE OK");

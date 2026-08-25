#!/usr/bin/env node
// Generates the placeholder avatar sprite sheet procedurally (D-17).
//
// Contract (see assets/CONTRACT.md):
//   cell 256x256, grid 4 columns x 5 rows -> PNG 1024x1280
//   rows (states): idle, falando, feliz, pensativo, surpreso
//   cols (mouths): rest, open_a, rounded_o, wide_e
//   metadata: assets/sprite.json
//
// Deterministic: no randomness, no timestamps. Same bytes every run.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "assets");
const PNG_PATH = path.join(OUT_DIR, "sprite-placeholder.png");
const JSON_PATH = path.join(OUT_DIR, "sprite.json");

const CELL = 256;
const COLS = 4;
const ROWS = 5;
const WIDTH = CELL * COLS;
const HEIGHT = CELL * ROWS;

const STATES = ["idle", "falando", "feliz", "pensativo", "surpreso"];
const MOUTHS = ["rest", "open_a", "rounded_o", "wide_e"];

// ---------- minimal RGBA canvas ----------
class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4, 0);
  }
  set(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    const sa = a / 255;
    // simple source-over alpha blend
    this.data[i] = Math.round(r * sa + this.data[i] * (1 - sa));
    this.data[i + 1] = Math.round(g * sa + this.data[i + 1] * (1 - sa));
    this.data[i + 2] = Math.round(b * sa + this.data[i + 2] * (1 - sa));
    this.data[i + 3] = Math.max(this.data[i + 3], a);
  }
  fillRect(x0, y0, w, h, color) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, color);
  }
  fillCircle(cx, cy, radius, color) {
    for (let y = Math.floor(cy - radius); y <= cy + radius; y++)
      for (let x = Math.floor(cx - radius); x <= cx + radius; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) this.set(x, y, color);
  }
  strokeEllipse(cx, cy, rx, ry, thickness, color) {
    for (let t = 0; t < Math.PI * 2; t += 0.002)
      for (let d = 0; d < thickness; d += 0.5)
        this.set(Math.round(cx + Math.cos(t) * (rx - d)), Math.round(cy + Math.sin(t) * (ry - d)), color);
  }
  fillEllipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, color);
  }
  strokeLine(x1, y1, x2, y2, thickness, color) {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 2;
    for (let i = 0; i <= steps; i++) {
      const x = x1 + ((x2 - x1) * i) / steps;
      const y = y1 + ((y2 - y1) * i) / steps;
      this.fillCircle(x, y, thickness, color);
    }
  }
}

// ---------- palette (blog tokens: paper/ink/accent) ----------
const PAPER = [246, 241, 231, 255];
const INK = [42, 37, 32, 255];
const ACCENT = [180, 83, 9, 255];
const CHEEK = [214, 158, 116, 255];

function drawFace(canvas, ox, oy, state, mouth) {
  const cx = ox + CELL / 2;

  // head
  canvas.fillEllipse(cx, oy + 118, 74, 80, INK);

  // eyes (fixed across all frames)
  canvas.fillEllipse(cx - 26, oy + 96, 7, 8, PAPER);
  canvas.fillEllipse(cx + 26, oy + 96, 7, 8, PAPER);

  // cheeks
  canvas.fillEllipse(cx - 44, oy + 122, 9, 6, CHEEK);
  canvas.fillEllipse(cx + 44, oy + 122, 9, 6, CHEEK);

  // eyebrows by state
  const browY = 72;
  if (state === "feliz") {
    canvas.strokeLine(cx - 36, oy + browY + 4, cx - 16, oy + browY - 4, 2.5, PAPER);
    canvas.strokeLine(cx + 16, oy + browY - 4, cx + 36, oy + browY + 4, 2.5, PAPER);
  } else if (state === "pensativo") {
    canvas.strokeLine(cx - 34, oy + browY, cx - 14, oy + browY + 2, 2.5, PAPER);
    canvas.strokeLine(cx + 18, oy + browY - 5, cx + 36, oy + browY + 3, 2.5, PAPER);
  } else if (state === "surpreso") {
    canvas.strokeLine(cx - 34, oy + browY - 8, cx - 14, oy + browY - 10, 2.5, PAPER);
    canvas.strokeLine(cx + 14, oy + browY - 10, cx + 34, oy + browY - 8, 2.5, PAPER);
  } else {
    canvas.strokeLine(cx - 35, oy + browY, cx - 15, oy + browY - 2, 2.5, PAPER);
    canvas.strokeLine(cx + 15, oy + browY - 2, cx + 35, oy + browY, 2.5, PAPER);
  }

  // extra state cues
  if (state === "surpreso") {
    // small accent spark above head
    canvas.fillCircle(cx + 58, oy + 30, 4, ACCENT);
  }
  if (state === "pensativo") {
    // hair strand
    canvas.strokeLine(cx - 8, oy + 40, cx + 26, oy + 22, 2.5, PAPER);
  }
  if (state === "feliz") {
    // closed happy eyes arcs
    canvas.strokeEllipse(cx - 26, oy + 96, 9, 5, 2, INK);
    canvas.strokeEllipse(cx + 26, oy + 96, 9, 5, 2, INK);
  }

  // mouths by viseme column
  const my = oy + 148;
  switch (mouth) {
    case "rest":
      canvas.strokeLine(cx - 12, my, cx + 12, my, 2.5, PAPER);
      break;
    case "open_a":
      canvas.fillEllipse(cx, my + 4, 12, 15, PAPER);
      break;
    case "rounded_o":
      canvas.fillEllipse(cx, my + 2, 9, 11, PAPER);
      break;
    case "wide_e":
      canvas.fillEllipse(cx, my, 20, 7, PAPER);
      break;
  }
}

function renderSheet() {
  const canvas = new Canvas(WIDTH, HEIGHT);
  canvas.fillRect(0, 0, WIDTH, HEIGHT, PAPER);
  const frames = [];
  STATES.forEach((state, row) => {
    MOUTHS.forEach((mouth, col) => {
      drawFace(canvas, col * CELL, row * CELL, state, mouth);
      frames.push({
        name: `${state}/${mouth}`,
        row,
        col,
        x: col * CELL,
        y: row * CELL,
      });
    });
  });
  return { canvas, frames };
}

// ---------- PNG encoder (truecolor + alpha, filter 0) ----------
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(canvas) {
  const { width, height, data } = canvas;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- main ----------
const { canvas, frames } = renderSheet();

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(PNG_PATH, encodePng(canvas));

const metadata = {
  image: "sprite-placeholder.png",
  cellWidth: CELL,
  cellHeight: CELL,
  columns: COLS,
  rows: ROWS,
  states: STATES,
  mouths: MOUTHS,
  frames,
};
fs.writeFileSync(JSON_PATH, JSON.stringify(metadata, null, 2) + "\n");

// smoke: validate dimensions and frame count against the contract
if (frames.length !== STATES.length * MOUTHS.length || canvas.width !== 1024 || canvas.height !== 1280) {
  console.error("sprite validation failed");
  process.exit(1);
}
console.log(`wrote ${PNG_PATH} (${WIDTH}x${HEIGHT}, ${frames.length} frames)`);

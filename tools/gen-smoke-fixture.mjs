// S5-12 fixture generator: builds a synthetic videos/smoke-long/ workspace
// with ~N minutes of content, 1 kHz beeps every 60 s and burned timecodes —
// everything deterministic so A/V drift becomes measurable.
//
//   node tools/gen-smoke-fixture.mjs --minutes 12 --data ./data
//
// Outputs (under <data>/videos/smoke-long/):
//   script.json                       N×60 s segments, markers [SHORT#1..2]
//   audio/<id>.wav                    440 Hz sine + 300 ms 1 kHz beep at t=0 of each segment
//   audio/<id>.blendshapes.json       deterministic ramp
//   timelines/<id>.timeline.json      mouth cues + idle body state, full duration
//   timelines/<id>.subtitles.en.json  one cue per segment (timecode text)
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const MINUTES = Number(arg("minutes", "12"));
const DATA = path.resolve(arg("data", "./data"));
if (!Number.isFinite(MINUTES) || MINUTES <= 0) {
  console.error("invalid --minutes");
  process.exit(1);
}

const SEGMENT_SECONDS = 60;
const COUNT = Math.max(1, Math.round((MINUTES * 60) / SEGMENT_SECONDS));
const SAMPLE_RATE = 48000;

const root = path.join(DATA, "videos", "smoke-long");
for (const dir of ["audio", "timelines", "assets"]) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

function mmss(totalSeconds) {
  const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const s = String(Math.floor(totalSeconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/** 440 Hz sine; last/first 300 ms carries a 1 kHz beep at segment start. */
function segmentWav(index) {
  const frames = SAMPLE_RATE * SEGMENT_SECONDS;
  const beepFrames = Math.round(SAMPLE_RATE * 0.3);
  const buf = Buffer.alloc(44 + frames * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + frames * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(frames * 2, 40);

  for (let i = 0; i < frames; i++) {
    let sample;
    if (i < beepFrames) {
      // Deterministic beep: 1 kHz for the first 300 ms of the segment.
      sample = Math.sin((2 * Math.PI * 1000 * i) / SAMPLE_RATE) * 9000;
    } else {
      sample = Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 6000;
    }
    buf.writeInt16LE(Math.round(sample), 44 + i * 2);
  }
  void index;
  return buf;
}

function timelineFor(id, durationMs) {
  const cues = [];
  const shapes = ["A", "E", "F", "B"];
  let t = 0;
  let k = 0;
  while (t < durationMs) {
    const end = Math.min(durationMs, t + 250);
    cues.push({ shape: shapes[k % shapes.length], start_ms: t, end_ms: end });
    t = end;
    k += 1;
  }
  return {
    version: 1,
    segment_id: id,
    duration_ms: durationMs,
    mouth_cues: cues,
    body_states: [{ state: "talking", start_ms: 0, end_ms: durationMs }],
    word_timings: [],
  };
}

function blendshapesFor(seed) {
  // Deterministic pseudo-ramp; consumer only needs stable bytes.
  const out = {};
  for (let f = 0; f < 52; f++) {
    out[`b${f}`] = Number((((seed * 37 + f * 11) % 100) / 100).toFixed(3));
  }
  return out;
}

const segments = [];
for (let i = 0; i < COUNT; i++) {
  const id = `seg-${String(i).padStart(2, "0")}`;
  const globalStart = i * SEGMENT_SECONDS;
  // Markers in first-appearance order (1..N) — planShorts rejects otherwise.
  const m1 = Math.floor(COUNT * 0.25);
  const m2 = Math.floor(COUNT * 0.75);
  let marker = "";
  if (COUNT >= 2 && i === m2 && m1 !== m2) marker = " [SHORT#2]";
  else if (i === m1) marker = " [SHORT#1]";

  segments.push({
    id,
    beat: "BEAT_EXAMPLE",
    emotion: "EMOTION_IDLE",
    narration_pt: `Segmento ${i + 1} de ${COUNT}, marcado em ${mmss(globalStart)}.${marker}`,
    scene: {
      type: "big_number",
      props: { value: mmss(globalStart), label: `timecode queimado ${id}` },
    },
  });

  fs.writeFileSync(path.join(root, "audio", `${id}.wav`), segmentWav(i));
  fs.writeFileSync(
    path.join(root, "audio", `${id}.blendshapes.json`),
    JSON.stringify(blendshapesFor(i + 1))
  );
  fs.writeFileSync(
    path.join(root, "timelines", `${id}.timeline.json`),
    JSON.stringify(timelineFor(id, SEGMENT_SECONDS * 1000))
  );
  fs.writeFileSync(
    path.join(root, "timelines", `${id}.subtitles.en.json`),
    JSON.stringify({
      version: 1,
      segment_id: id,
      cues: [
        {
          start_ms: 0,
          end_ms: SEGMENT_SECONDS * 1000 - 500,
          text: `Burned timecode ${mmss(globalStart)} (${id})`,
        },
      ],
    })
  );
}

const script = {
  post: "smoke-long",
  language: { spoken: "pt-BR", subtitles: "en" },
  target: { durationMin: MINUTES },
  segments,
};

fs.writeFileSync(path.join(root, "script.json"), JSON.stringify(script, null, 2));

console.log(
  `fixture ready: ${root}\n` +
    `  segments : ${COUNT} × ${SEGMENT_SECONDS}s (${MINUTES} min)\n` +
    `  beeps    : 1 kHz nos primeiros 300 ms de cada segmento\n` +
    `  shorts   : [SHORT#1] em seg-${String(Math.floor(COUNT * 0.25)).padStart(2, "0")}, [SHORT#2] em seg-${String(Math.floor(COUNT * 0.75)).padStart(2, "0")}\n` +
    `Próximos passos: aprovar cenas (ApproveScenes) e deixar o runner consumir.`
);

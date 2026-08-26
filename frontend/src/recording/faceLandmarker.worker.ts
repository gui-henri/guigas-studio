/// <reference lib="webworker" />
// Face Landmarker worker (S2-02): runs MediaPipe Face Landmarker off the main
// thread and emits batches of 52 ARKit blendshapes with timestamps relative to
// recording start (t0). Frames arrive as transferred ImageBitmaps and are
// closed immediately after inference to keep memory flat.
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MODEL_CACHE = "guigas-models";
const BATCH_INTERVAL_MS = 500;
const STATS_INTERVAL_MS = 1000;

type OutMessage =
  | { type: "ready"; delegate: "webgpu" | "cpu" }
  | { type: "samples"; batch: { t: number; bs: number[] }[] }
  | { type: "stats"; fps: number }
  | { type: "error"; message: string };

function post(msg: OutMessage, transfer?: Transferable[]): void {
  (self as unknown as Worker).postMessage(msg, transfer ?? []);
}

/** Fetch the model through the Cache API so it is downloaded only once. */
async function loadModelBuffer(url: string): Promise<ArrayBuffer> {
  const cache = await caches.open(MODEL_CACHE);
  const hit = await cache.match(url);
  if (hit) return hit.arrayBuffer();
  const resp = await fetch(url); // default caching; never no-store here
  if (!resp.ok) throw new Error(`model fetch failed: ${resp.status}`);
  await cache.put(url, resp.clone());
  return resp.arrayBuffer();
}

let landmarker: FaceLandmarker | null = null;

async function init(): Promise<"webgpu" | "cpu"> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const modelBuffer = await loadModelBuffer(MODEL_URL);

  const make = async (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer.slice(0)), delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    });

  try {
    landmarker = await make("GPU");
    return "webgpu";
  } catch {
    landmarker = await make("CPU");
    return "cpu";
  }
}

let lastTimestamp = -1;
let t0: number | null = null;
let batch: { t: number; bs: number[]; names?: string[] }[] = [];
let inferred = 0;
let lastStatsAt = 0;

function flushBatch(force = false): void {
  if (!t0) return;
  if (batch.length === 0 && !force) return;
  if (force && batch.length === 0) return;
  post({ type: "samples", batch });
  batch = [];
}

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as
    | { type: "init" }
    | { type: "start"; t0: number }
    | { type: "frame"; bitmap: ImageBitmap; t: number }
    | { type: "stop" };

  switch (msg.type) {
    case "init":
      init()
        .then((delegate) => post({ type: "ready", delegate }))
        .catch((err: unknown) =>
          post({ type: "error", message: String((err as Error)?.message ?? err) })
        );
      break;

    case "start":
      t0 = msg.t0;
      lastTimestamp = -1;
      batch = [];
      break;

    case "frame": {
      const { bitmap, t } = msg;
      try {
        if (!landmarker || t0 === null) {
          bitmap.close();
          return;
        }
        // detectForVideo requires strictly increasing timestamps.
        if (t <= lastTimestamp) {
          bitmap.close();
          return;
        }
        lastTimestamp = t;
        const result = landmarker.detectForVideo(bitmap, t);
        bitmap.close(); // free immediately — no accumulation
        inferred++;

        const categories = result.faceBlendshapes?.[0]?.categories;
        if (categories) {
          const bs = new Array<number>(categories.length);
          const names = new Array<string>(categories.length);
          for (let i = 0; i < categories.length; i++) {
            bs[i] = categories[i].score;
            names[i] = categories[i].categoryName ?? "";
          }
          batch.push({ t, bs, names });

          const now = performance.now();
          if (now - lastStatsAt >= STATS_INTERVAL_MS) {
            const fps = ((inferred - 0) * 1000) / Math.max(now - lastStatsAt, 1);
            post({ type: "stats", fps: Math.round(fps * 10) / 10 });
            lastStatsAt = now;
            inferred = 0;
          }
          if (now % BATCH_INTERVAL_MS < 20 || batch.length >= 32) flushBatch();
        }
      } catch (err: unknown) {
        bitmap.close();
        post({ type: "error", message: String((err as Error)?.message ?? err) });
      }
      break;
    }

    case "stop":
      flushBatch(true);
      t0 = null;
      break;
  }
};

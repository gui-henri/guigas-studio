import { useCallback, useEffect, useRef, useState } from "react";

export interface FaceLandmarkerState {
  delegate: "webgpu" | "cpu" | null;
  fps: number;
  faceDetected: boolean;
  error: string | null;
  start: (t0: number) => void;
  stop: () => void;
}

export interface BlendshapeBatchItem {
  t: number;
  bs: number[];
  names?: string[];
}

type WorkerOut =
  | { type: "ready"; delegate: "webgpu" | "cpu" }
  | { type: "samples"; batch: BlendshapeBatchItem[] }
  | { type: "live_sample"; bs: number[]; faceDetected: boolean }
  | { type: "stats"; fps: number }
  | { type: "error"; message: string };

/**
 * Owns the face-landmarker worker lifecycle and feeds it frames from the
 * attached <video> via requestVideoFrameCallback (transferable ImageBitmaps).
 * `onSamples` receives blendshape batches; `t` is relative to the t0 passed
 * into `start()`.
 */
export function useFaceLandmarker(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onSamples?: (batch: BlendshapeBatchItem[]) => void,
  onLiveSample?: (sample: { bs: number[]; faceDetected: boolean }) => void,
  enabled = true
): FaceLandmarkerState {
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number>(0);
  const samplesRef = useRef(onSamples);
  const liveSampleRef = useRef(onLiveSample);
  const [delegate, setDelegate] = useState<"webgpu" | "cpu" | null>(null);
  const [fps, setFps] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    samplesRef.current = onSamples;
  }, [onSamples]);

  useEffect(() => {
    liveSampleRef.current = onLiveSample;
  }, [onLiveSample]);

  // Worker initialization
  useEffect(() => {
    if (!enabled) return;
    const worker = new Worker(
      new URL("./faceLandmarker.worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data;
      switch (msg.type) {
        case "ready":
          setDelegate(msg.delegate);
          setReady(true);
          break;
        case "samples":
          samplesRef.current?.(msg.batch);
          break;
        case "live_sample":
          setFaceDetected(msg.faceDetected);
          liveSampleRef.current?.(msg);
          break;
        case "stats":
          setFps(msg.fps);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    };
    worker.postMessage({ type: "init" });

    return () => {
      setReady(false);
      worker.terminate();
      workerRef.current = null;
    };
  }, [enabled]);

  // Continuous frame pumping loop (runs whenever worker is ready and video is playing)
  useEffect(() => {
    if (!ready || !enabled) return;
    let cancelled = false;
    let inFlight = false;

    const pump = () => {
      if (cancelled) return;
      const video = videoRef.current;
      const worker = workerRef.current;

      if (
        video &&
        worker &&
        !video.paused &&
        !video.ended &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        !inFlight
      ) {
        inFlight = true;
        createImageBitmap(video)
          .then((bm) => {
            if (cancelled) {
              bm.close();
              return;
            }
            worker.postMessage(
              { type: "frame", bitmap: bm, t: performance.now() },
              [bm]
            );
          })
          .catch(() => {})
          .finally(() => {
            inFlight = false;
          });
      }
      rafRef.current = requestAnimationFrame(pump);
    };

    rafRef.current = requestAnimationFrame(pump);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
    };
  }, [ready, enabled, videoRef]);

  const start = useCallback((t0: number) => {
    workerRef.current?.postMessage({ type: "start", t0 });
  }, []);

  const stop = useCallback(() => {
    workerRef.current?.postMessage({ type: "stop" });
  }, []);

  return { delegate, fps, faceDetected, error, start, stop };
}

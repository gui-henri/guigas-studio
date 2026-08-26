import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoFrameCallbackMetadata } from "./types";

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
  const runningRef = useRef(false);
  const samplesRef = useRef(onSamples);
  const liveSampleRef = useRef(onLiveSample);
  const [delegate, setDelegate] = useState<"webgpu" | "cpu" | null>(null);
  const [fps, setFps] = useState(0);
  const [faceDetected, setFaceDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    samplesRef.current = onSamples;
  }, [onSamples]);

  useEffect(() => {
    liveSampleRef.current = onLiveSample;
  }, [onLiveSample]);

  const feedLoop = useCallback(() => {
    const video = videoRef.current;
    const worker = workerRef.current;
    if (!video || !worker || !runningRef.current) return;

    const send = (metadata?: VideoFrameCallbackMetadata) => {
      void metadata;
      if (!runningRef.current || !video.videoWidth || video.paused || video.ended) {
        if (runningRef.current) {
          rafRef.current = requestAnimationFrame(() => send());
        }
        return;
      }
      const bitmap = createImageBitmap(video);
      bitmap
        .then((bm) => {
          if (!runningRef.current) {
            bm.close();
            return;
          }
          worker.postMessage(
            { type: "frame", bitmap: bm, t: performance.now() },
            [bm]
          );
        })
        .catch(() => {});

      if ("requestVideoFrameCallback" in video) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (video as any).requestVideoFrameCallback(send);
      } else {
        rafRef.current = requestAnimationFrame(() => send());
      }
    };

    if ("requestVideoFrameCallback" in video) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (video as any).requestVideoFrameCallback(send);
    } else {
      rafRef.current = requestAnimationFrame(() => send());
    }
  }, [videoRef]);

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
          runningRef.current = true;
          feedLoop();
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
      cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
      worker.terminate();
      workerRef.current = null;
    };
  }, [enabled, feedLoop]);

  const start = useCallback(
    (t0: number) => {
      workerRef.current?.postMessage({ type: "start", t0 });
      if (!runningRef.current) {
        runningRef.current = true;
        feedLoop();
      }
    },
    [feedLoop]
  );

  const stop = useCallback(() => {
    workerRef.current?.postMessage({ type: "stop" });
  }, []);

  return { delegate, fps, faceDetected, error, start, stop };
}

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { startMicCapture } from "../../audio/micCapture";
import {
  serializeBlendshapes,
  type BlendshapeSample,
  type SpriteState,
} from "../../recording/stateMapping";
import { useFaceLandmarker } from "../../recording/useFaceLandmarker";
import { uploadTakeArtifact } from "../../lib/uploadClient";

export type RecorderPhase =
  | "idle"
  | "recording"
  | "encoding"
  | "uploading"
  | "done"
  | "error";

export interface RecordedPair {
  wavBlob: Blob;
  blendshapesJson: string;
  durationMs: number;
}

export interface SegmentRecorderState {
  phase: RecorderPhase;
  progress: number; // 0..1 during uploading
  error: string | null;
  localPair: RecordedPair | null; // kept when uploads fail (manual retry)
  fps: number;
  delegate: "webgpu" | "cpu" | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  retryUploads: () => Promise<void>;
}

/**
 * Orchestrates one synchronized take: mic capture + face-landmarker worker on
 * a shared clock (performance.now-based t0), then sequential artifact uploads
 * against the S2-01 endpoint. An incomplete pair never leaves the browser.
 */
export function useSegmentRecorder(
  videoSlug: string,
  segmentId: string,
  videoRef: React.RefObject<HTMLVideoElement | null>,
  streamRef: React.RefObject<MediaStream | null>
): SegmentRecorderState & { stateRef: React.MutableRefObject<SpriteState> } {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [localPair, setLocalPair] = useState<RecordedPair | null>(null);

  const samplesRef = useRef<BlendshapeSample[]>([]);
  const captureRef = useRef<Awaited<ReturnType<typeof startMicCapture>> | null>(null);
  const abortRef = useRef(false);
  const awaitingFlush = useRef<(() => void) | null>(null);
  const stateRef = useRef<SpriteState>("idle");
  const queryClient = useQueryClient();

  const landmarker = useFaceLandmarker(videoRef, (batch) => {
    if (abortRef.current) return;
    samplesRef.current.push(...batch);
    // Coarse live avatar state from the freshest sample.
    void batch;
    stateRef.current = deriveCoarseState(samplesRef.current);
    const flush = awaitingFlush.current;
    if (flush) {
      awaitingFlush.current = null;
      flush();
    }
  });

  const guard = useCallback(
    async (stream: MediaStream | null) => {
      // Webcam lost mid-take → whole take is aborted, nothing uploads.
      if (!stream || stream.getVideoTracks().every((t) => t.readyState !== "live")) {
        abortRef.current = true;
        return true;
      }
      return false;
    },
    []
  );

  const doStop = useCallback(async (): Promise<void> => {
    if (phase !== "recording") return;
    setPhase("encoding");

    const capture = captureRef.current;
    captureRef.current = null;

    // Ask the worker to flush pending samples and wait for the final message.
    const flushed = new Promise<void>((resolve) => {
      awaitingFlush.current = resolve;
      setTimeout(resolve, 600); // never hang forever
    });
    landmarker.stop();
    await flushed;

    if (capture === null) {
      setPhase("idle");
      return;
    }
    const audio = await capture.stop();

    if (abortRef.current) {
      samplesRef.current = [];
      abortRef.current = false;
      setPhase("idle");
      setError("take abortado: webcam perdida no meio da gravação");
      return;
    }

    const pair: RecordedPair = {
      wavBlob: audio.blob,
      durationMs: Math.round(audio.durationMs),
      blendshapesJson: JSON.stringify(serializeBlendshapes(samplesRef.current)),
    };
    samplesRef.current = [];
    setLocalPair(pair);

    try {
      setPhase("uploading");
      await uploadTakeArtifact(videoSlug, segmentId, "audio", pair.wavBlob, (p) =>
        setProgress(p.fraction / 2)
      );
      await uploadTakeArtifact(
        videoSlug,
        segmentId,
        "blendshapes",
        new Blob([pair.blendshapesJson], { type: "application/json" }),
        (p) => setProgress(0.5 + p.fraction / 2)
      );
      setPhase("done");
      setLocalPair(null);
      // Refresh takes lists everywhere; the SSE event also confirms recording.
      void queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0]).includes("VideoService"),
      });
    } catch (err: unknown) {
      setError(`upload falhou — par mantido localmente: ${String((err as Error).message ?? err)}`);
      setPhase("error");
    }
  }, [phase, landmarker, videoSlug, segmentId, queryClient]);

  const doStart = useCallback(async (): Promise<void> => {
    if (phase === "recording") {
      console.warn("start() ignorado: gravação já em curso");
      return;
    }
    setError(null);
    setProgress(0);
    samplesRef.current = [];
    abortRef.current = false;
    stateRef.current = "idle";

    const t0 = performance.now(); // shared clock for both pipelines
    const stream = streamRef.current;
    landmarker.start(t0);
    try {
      captureRef.current = await startMicCapture({});
    } catch (err: unknown) {
      landmarker.stop();
      setError(String((err as Error).message ?? err));
      setPhase("error");
      return;
    }
    if (await guard(stream)) {
      await captureRef.current?.stop();
      landmarker.stop();
      setPhase("idle");
      return;
    }
    setPhase("recording");
  }, [phase, landmarker, guard, streamRef]);

  const retryUploads = useCallback(async (): Promise<void> => {
    if (!localPair) return;
    setPhase("uploading");
    try {
      await uploadTakeArtifact(videoSlug, segmentId, "audio", localPair.wavBlob, (p) =>
        setProgress(p.fraction / 2)
      );
      await uploadTakeArtifact(
        videoSlug,
        segmentId,
        "blendshapes",
        new Blob([localPair.blendshapesJson], { type: "application/json" }),
        (p) => setProgress(0.5 + p.fraction / 2)
      );
      setPhase("done");
      setLocalPair(null);
    } catch (err: unknown) {
      setError(String((err as Error).message ?? err));
      setPhase("error");
    }
  }, [localPair, videoSlug, segmentId]);

  return {
    phase,
    progress,
    error,
    localPair,
    fps: landmarker.fps,
    delegate: landmarker.delegate,
    start: doStart,
    stop: doStop,
    retryUploads,
    stateRef,
  };
}

// Minimal inline derivation so the live avatar reacts without importing the
// full mapping here (full timeline mapping happens in serializeBlendshapes).
function deriveCoarseState(samples: BlendshapeSample[]): SpriteState {
  const last = samples[samples.length - 1];
  if (!last) return "idle";
  const jawOpen = last.bs[22] ?? 0;
  return jawOpen > 0.25 ? "talking" : "idle";
}

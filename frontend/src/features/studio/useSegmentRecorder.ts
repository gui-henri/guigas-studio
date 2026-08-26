import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { startMicCapture } from "../../audio/micCapture";
import {
  mapSampleToState,
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
  faceDetected: boolean;
  delegate: "webgpu" | "cpu" | null;
  audioLevel: number;
  samplesCount: number;
  elapsedMs: number;
  lastSavedAudioUrl: string | null;
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
  const [audioLevel, setAudioLevel] = useState(0);
  const [samplesCount, setSamplesCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastSavedAudioUrl, setLastSavedAudioUrl] = useState<string | null>(null);

  const samplesRef = useRef<BlendshapeSample[]>([]);
  const captureRef = useRef<Awaited<ReturnType<typeof startMicCapture>> | null>(null);
  const abortRef = useRef(false);
  const awaitingFlush = useRef<(() => void) | null>(null);
  const stateRef = useRef<SpriteState>("idle");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const queryClient = useQueryClient();

  const landmarker = useFaceLandmarker(
    videoRef,
    (batch) => {
      if (abortRef.current) return;
      samplesRef.current.push(...batch);
      setSamplesCount(samplesRef.current.length);
      const flush = awaitingFlush.current;
      if (flush) {
        awaitingFlush.current = null;
        flush();
      }
    },
    (live) => {
      if (live.faceDetected && live.bs.length > 0) {
        stateRef.current = mapSampleToState(live.bs);
      } else {
        stateRef.current = "idle";
      }
    }
  );

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

  // Clean up previous blob URL on unmount or new record
  useEffect(() => {
    return () => {
      if (lastSavedAudioUrl) URL.revokeObjectURL(lastSavedAudioUrl);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [lastSavedAudioUrl]);

  const doStop = useCallback(async (): Promise<void> => {
    if (phase !== "recording") return;
    setPhase("encoding");
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

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
    setAudioLevel(0);

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

    const audioUrl = URL.createObjectURL(pair.wavBlob);
    setLastSavedAudioUrl(audioUrl);

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
    setSamplesCount(0);
    setElapsedMs(0);
    samplesRef.current = [];
    abortRef.current = false;

    const t0 = performance.now(); // shared clock for both pipelines
    startedAtRef.current = t0;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedMs(performance.now() - startedAtRef.current);
    }, 100);

    const stream = streamRef.current;
    landmarker.start(t0);
    try {
      captureRef.current = await startMicCapture({
        onLevel: (lvl) => setAudioLevel(lvl),
      });
    } catch (err: unknown) {
      landmarker.stop();
      if (timerRef.current) clearInterval(timerRef.current);
      setError(String((err as Error).message ?? err));
      setPhase("error");
      return;
    }
    if (await guard(stream)) {
      await captureRef.current?.stop();
      landmarker.stop();
      if (timerRef.current) clearInterval(timerRef.current);
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
    faceDetected: landmarker.faceDetected,
    delegate: landmarker.delegate,
    audioLevel,
    samplesCount,
    elapsedMs,
    lastSavedAudioUrl,
    start: doStart,
    stop: doStop,
    retryUploads,
    stateRef,
  };
}

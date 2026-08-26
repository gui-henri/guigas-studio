import { useEffect, useState } from "react";

import { TOKEN_STORAGE_KEY } from "../lib/transport";

export interface SegmentAssets {
  wavUrl: string | null;
  timelineJson: string | null;
  loading: boolean;
}

/**
 * Fetches (authenticated) the WAV + avatar timeline of a segment into blob
 * object URLs; revoked on cleanup. Cache-busting is intentional: re-recorded
 * takes change bytes and stale URLs would show ghost takes.
 */
export function useSegmentAssets(videoId: string, segmentId: string): SegmentAssets {
  const [state, setState] = useState<SegmentAssets>({
    wavUrl: null,
    timelineJson: null,
    loading: true,
  });

  useEffect(() => {
    if (!videoId || !segmentId) {
      setState({ wavUrl: null, timelineJson: null, loading: false });
      return;
    }
    const controller = new AbortController();
    let wavUrl: string | null = null;
    let timelineUrl: string | null = null;
    let cancelled = false;

    async function fetchOne(relPath: string): Promise<string | null> {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      const resp = await fetch(
        `/api/v1/videos/${videoId}/artifacts/${relPath}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal }
      );
      if (!resp.ok) return null;
      return URL.createObjectURL(await resp.blob());
    }

    void (async () => {
      setState((s) => ({ ...s, loading: true }));
      try {
        wavUrl = await fetchOne(`audio/${segmentId}.wav`);
        timelineUrl = await fetchOne(`timelines/${segmentId}.timeline.json`);
      } catch {
        /* aborted or network error → keep whatever resolved */
      }
      if (cancelled) return;
      setState({ wavUrl, timelineJson: timelineUrl, loading: false });
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (wavUrl) URL.revokeObjectURL(wavUrl);
      if (timelineUrl) URL.revokeObjectURL(timelineUrl);
    };
  }, [videoId, segmentId]);

  return state;
}

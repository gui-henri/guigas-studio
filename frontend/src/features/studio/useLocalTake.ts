import { useCallback, useRef, useState } from "react";

export interface LocalTake {
  wavBlob: Blob;
  blobUrl: string;
  durationMs: number;
  takeNumber: number;
}

/** Local take state where the last take wins; revokes replaced blob URLs. */
export function useLocalTake() {
  const [take, setTake] = useState<LocalTake | null>(null);
  const counter = useRef(0);

  const replace = useCallback(
    (wavBlob: Blob, durationMs: number) => {
      setTake((prev) => {
        if (prev) URL.revokeObjectURL(prev.blobUrl);
        counter.current += 1;
        return {
          wavBlob,
          blobUrl: URL.createObjectURL(wavBlob),
          durationMs,
          takeNumber: counter.current,
        };
      });
    },
    []
  );

  const reset = useCallback(() => {
    setTake((prev) => {
      if (prev) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });
  }, []);

  return { take, replace, reset };
}

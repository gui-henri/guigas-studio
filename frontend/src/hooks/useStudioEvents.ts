import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { streamStudioEvents } from "../lib/sse";
import { TOKEN_STORAGE_KEY } from "../lib/transport";

/**
 * Subscribes once to the global SSE topic and invalidates TanStack Query
 * caches when studio events arrive. Mounted a single time in the app shell.
 */
export function useStudioEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) return;

    const controller = new AbortController();
    void streamStudioEvents({
      topic: "global",
      token,
      signal: controller.signal,
      onEvent: (evt) => {
        const which = evt.event.case;
        if (
          which === "videoStatusChanged" ||
          which === "scriptValidated" ||
          which === "scenesValidated" ||
          which === "watcherPostFound"
        ) {
          // Connect-RPC query keys embed the service name; predicate-based
          // invalidation refreshes every video-related cache.
          void queryClient.invalidateQueries({
            predicate: (query) =>
              String(query.queryKey[0]).includes("VideoService"),
          });
        }
      },
    });

    return () => controller.abort();
  }, [queryClient]);
}
import type { StudioEvent as StudioEventType } from "../gen/app/studio/v1/events_pb";
import { StudioEventSchema } from "../gen/app/studio/v1/events_pb";
import { fromJson } from "@bufbuild/protobuf";

const eventsSchema = StudioEventSchema;

export interface StudioEventsOptions {
  topic?: string;
  token: string;
  onEvent: (evt: StudioEventType) => void;
  onStatus?: (status: "connecting" | "open" | "closed") => void;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch-based SSE reader with Authorization header support (D-03) and
 * exponential backoff + jitter reconnection. Aborts cleanly via signal.
 */
export async function streamStudioEvents(opts: StudioEventsOptions): Promise<void> {
  const { topic = "global", token, onEvent, onStatus, signal } = opts;
  let backoffMs = 500;

  for (;;) {
    if (signal?.aborted) return;
    try {
      onStatus?.("connecting");
      const resp = await fetch(`/api/events?topic=${encodeURIComponent(topic)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`SSE status ${resp.status}`);

      onStatus?.("open");
      backoffMs = 500; // reset on successful connect

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const dataLine = frame
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue; // heartbeat / comment frames
          try {
            onEvent(fromJson(eventsSchema, JSON.parse(dataLine.slice(6))) as StudioEventType);
          } catch {
            // malformed frame: skip, keep the stream alive
          }
        }
      }
    } catch {
      if (signal?.aborted) return;
    }

    onStatus?.("closed");
    // Exponential backoff with jitter before reconnecting.
    const jitter = Math.random() * backoffMs * 0.3;
    await sleep(backoffMs + jitter);
    backoffMs = Math.min(backoffMs * 2, 15_000);
  }
}

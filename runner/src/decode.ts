// Payload decoding helpers shared by the main loop (kept tiny and pure for
// unit testing — malformed payloads degrade to safe defaults).

export interface JobPayloadDecoded {
  slug: string;
  expectedShorts: number;
}

export function decodePayload(payloadJson: string): JobPayloadDecoded {
  try {
    const raw = JSON.parse(payloadJson) as { slug?: string; expected_shorts?: number };
    return {
      slug: typeof raw.slug === "string" ? raw.slug : "",
      expectedShorts:
        typeof raw.expected_shorts === "number" ? raw.expected_shorts : 0,
    };
  } catch {
    return { slug: "", expectedShorts: 0 };
  }
}

/** Mirrors the server-side CountShortMarkers contract (distinct markers). */
export function CountShort(text: string): number {
  const matches = text.match(/\[SHORT#(\d+)\]/g) ?? [];
  return new Set(matches).size;
}

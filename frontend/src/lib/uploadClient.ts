import { TOKEN_STORAGE_KEY } from "./transport";

export interface UploadProgress {
  artifact: string;
  fraction: number;
}

const CHUNK_SIZE = 1 << 20; // 1 MiB

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Chunked resumable upload against the S2-01 endpoint. Probes what the server
 * already holds, streams the blob in chunks and verifies sha256 on finalize.
 */
export async function uploadTakeArtifact(
  videoSlug: string,
  segmentId: string,
  kind: "audio" | "blendshapes",
  blob: Blob,
  onProgress?: (p: UploadProgress) => void,
  attemptsLeft = 2
): Promise<void> {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) throw new Error("sem sessão: faça login antes de enviar takes");
  const base = `/api/v1/videos/${videoSlug}/takes`;
  const headers = { Authorization: `Bearer ${token}` };

  // Probe current server-side size for this artifact.
  let offset = 0;
  try {
    const probe = await fetch(
      `${base}?segment_id=${encodeURIComponent(segmentId)}&kind=${kind}&probe=1`,
      { headers }
    );
    if (probe.ok) {
      const info = (await probe.json()) as { size?: number };
      offset = Math.max(0, Math.min(blob.size, info.size ?? 0));
    }
  } catch {
    /* fresh upload */
  }

  const buf = await blob.arrayBuffer();
  const total = buf.byteLength;
  if (total === 0) throw new Error(`${kind}: arquivo vazio`);
  const checksum = await sha256Hex(buf);

  try {
    while (offset < total) {
      const end = Math.min(offset + CHUNK_SIZE, total);
      const resp = await fetch(
        `${base}?segment_id=${encodeURIComponent(segmentId)}&kind=${kind}&offset=${offset}`,
        {
          method: "POST",
          headers: {
            ...headers,
            "X-Total-Size": String(total),
            "X-Checksum-Sha256": checksum,
          },
          body: buf.slice(offset, end),
        }
      );
      if (!resp.ok) {
        throw new Error(`${kind}: chunk falhou (${resp.status})`);
      }
      const result = (await resp.json()) as { next_offset?: number; complete?: boolean };
      offset = result.next_offset ?? end;
      onProgress?.({ artifact: kind, fraction: offset / total });
      if (result.complete) return;
    }
    return; // already complete (resume hit exact boundary)
  } catch (err: unknown) {
    if (attemptsLeft > 1) {
      await new Promise((r) => setTimeout(r, 800));
      return uploadTakeArtifact(videoSlug, segmentId, kind, blob, onProgress, attemptsLeft - 1);
    }
    void buf;
    throw err;
  }
}

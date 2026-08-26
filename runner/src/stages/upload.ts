import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { JobContext } from "./types.js";

export interface UploadOptions {
  baseUrl: string;
  bearerToken: string;
  videoId: string;
}

export interface RenderFile {
  fileName: string; // e.g. "long.mp4", "short-1.mp4"
  sha256: string;
  bytes: number;
  durationS?: number;
}

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB — memory/HTTP overhead balance

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * S5-07: uploads every rendered file chunked (4 MB) into the workspace
 * renders/ dir, then finalizes with size+sha256. A checksum conflict
 * triggers up to 2 full re-sends before surfacing a retryable failure.
 */
export async function uploadRenders(
  ctx: JobContext,
  files: readonly RenderFile[],
  opts: UploadOptions
): Promise<void> {
  const root = ctx.workDir(ctx.slug);
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  let sent = 0;

  for (const file of files) {
    await ctx.checkCancelled();
    const localPath = path.join(root, "out", file.fileName);
    if (!fs.existsSync(localPath)) {
      throw new Error(`render missing locally: ${file.fileName}`);
    }
    const data = fs.readFileSync(localPath);

    let uploaded = false;
    for (let attempt = 0; attempt < 3 && !uploaded; attempt++) {
      if (attempt > 0) {
        ctx.log.warn({ file: file.fileName, attempt }, "re-sending render");
      }
      await sendOne(opts, file.fileName, data, token => token);
      try {
        await finalize(ctx, opts, file.fileName, sha256Hex(data), data.length);
        uploaded = true;
      } catch (err) {
        if (attempt === 2) throw err;
        // server wiped the temp on mismatch — resend from zero next loop
      }
    }
    sent += data.length;
    await ctx.report("upload", Math.round((sent / Math.max(1, totalBytes)) * 100));
  }

  async function sendOne(
    o: UploadOptions,
    fileName: string,
    data: Buffer,
    _t: (t: string) => string
  ): Promise<void> {
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      await ctx.checkCancelled();
      const end = Math.min(offset + CHUNK_SIZE, data.length);
      const resp = await fetch(renderUrl(o.baseUrl, o.videoId, fileName, "chunks"), {
        method: "PUT",
        headers: {
          ...authHeaders(o.bearerToken),
          "X-Offset": String(offset),
          "Content-Type": "application/octet-stream",
        },
        body: data.subarray(offset, end),
      });
      if (!resp.ok) {
        throw new Error(`chunk PUT ${fileName}@${offset}: HTTP ${resp.status}`);
      }
    }
  }

  async function finalize(
    _ctx: JobContext,
    o: UploadOptions,
    fileName: string,
    hash: string,
    bytes: number
  ): Promise<void> {
    const resp = await fetch(renderUrl(o.baseUrl, o.videoId, fileName, "finalize"), {
      method: "POST",
      headers: { ...authHeaders(o.bearerToken), "Content-Type": "application/json" },
      body: JSON.stringify({ sha256: hash, bytes }),
    });
    if (resp.status === 409) {
      throw new Error(`checksum conflict for ${fileName}`);
    }
    if (!resp.ok) {
      throw new Error(`finalize ${fileName}: HTTP ${resp.status}`);
    }
  }
}

function renderUrl(baseUrl: string, videoId: string, fileName: string, action: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/v1/videos/${encodeURIComponent(videoId)}/renders/${encodeURIComponent(fileName)}/${action}`;
}

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

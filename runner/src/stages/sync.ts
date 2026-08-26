import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import type { JobContext } from "./types.js";

export interface InputFile {
  path: string; // POSIX, relative to videos/<slug>/
  sha256: string;
  bytes: number;
}

export interface SyncManifestEntry {
  path: string; // POSIX, relative to videos/<slug>/
  sha256: string;
  bytes: number;
}

export interface SyncOptions {
  /** Base URL of the files endpoint (server). */
  baseUrl: string;
  videoId: string;
  bearerToken: string;
}

export interface DownloadResult {
  verified: number;
  refetched: number;
}

/**
 * Downloads every manifest entry into WORK_DIR/<slug>/<relpath>, verifying
 * sha256 stream-wise. A mismatch triggers exactly ONE refetch; a second
 * mismatch fails the stage — already-validated files are never touched
 * again (S5-04 acceptance).
 */
export async function syncInputs(
  ctx: JobContext,
  manifest: readonly InputFile[],
  opts: SyncOptions
): Promise<DownloadResult> {
  const root = ctx.workDir(ctx.slug);
  let refetched = 0;

  for (let i = 0; i < manifest.length; i++) {
    const entry = manifest[i];
    await ctx.checkCancelled();

    const target = path.join(root, path.normalize(entry.path));
    if (!path.resolve(target).startsWith(path.resolve(root))) {
      throw new Error(`manifest path escapes workdir: ${entry.path}`);
    }

    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      if (attempt === 1) refetched += 1; // one clean retry on mismatch
      const data = await fetchFile(opts.baseUrl, opts.videoId, entry.path, opts.bearerToken);
      const hash = createHash("sha256").update(data).digest("hex");
      if (hash !== entry.sha256) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
      ok = true;
    }
    if (!ok) {
      throw new Error(`checksum mismatch after retry: ${entry.path}`);
    }

    await ctx.report("sync", Math.round(((i + 1) / manifest.length) * 100));
  }

  // Audit trail for the local run.
  fs.writeFileSync(
    path.join(root, "manifest.local.json"),
    JSON.stringify({ syncedAt: new Date().toISOString(), entries: manifest }, null, 2)
  );

  return { verified: manifest.length, refetched };
}

async function fetchFile(
  baseUrl: string,
  videoId: string,
  relPath: string,
  token: string
): Promise<Buffer> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/videos/${encodeURIComponent(videoId)}/files/${relPath}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    throw new Error(`download ${relPath}: HTTP ${resp.status}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

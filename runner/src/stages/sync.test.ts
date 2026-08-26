import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  syncInputs,
  type InputFile,
} from "./sync.js";

const FILE_BODY = Buffer.from("conteudo do arquivo de teste\n");

function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function makeCtx(root: string) {
  const reported: Array<{ stage: string; percent: number }> = [];
  return {
    ctx: {
      jobId: "j1",
      videoId: "vid-1",
      slug: "demo",
      expectedShorts: 0,
      warnings: [],
      log: {
        info() {}, warn() {}, error() {}, debug() {}, child() { return this; },
      } as never,
      report: async (stage: string, percent: number) => {
        reported.push({ stage, percent });
        return percent;
      },
      checkCancelled: async () => undefined,
      workDir: () => root,
    },
    reported,
  };
}

function startFileServer(
  bodyFor: (relPath: string) => Buffer,
  status = 200
): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const rel = decodeURIComponent(req.url?.split("/files/")[1] ?? "");
      res.statusCode = status;
      res.end(bodyFor(rel));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

let workRoot: string;

describe("syncInputs", () => {
  beforeAll(() => {
    workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "runner-sync-"));
  });

  afterAll(() => {
    fs.rmSync(workRoot, { recursive: true, force: true });
  });

  it("downloads the manifest tree and verifies checksums", async () => {
    const { server, url } = await startFileServer((rel) =>
      rel === "script.json" ? FILE_BODY : Buffer.from(`data of ${rel}`)
    );
    const { ctx, reported } = makeCtx(path.join(workRoot, "ok"));
    const manifest: InputFile[] = [
      { path: "script.json", sha256: sha256(FILE_BODY), bytes: FILE_BODY.length },
      {
        path: "timelines/hook.timeline.json",
        sha256: sha256(Buffer.from("data of timelines/hook.timeline.json")),
        bytes: 33,
      },
    ];

    try {
      const result = await syncInputs(ctx, manifest, {
        baseUrl: url,
        videoId: "vid-1",
        bearerToken: "pat",
      });
      expect(result.verified).toBe(2);
      expect(fs.readFileSync(path.join(workRoot, "ok", "script.json"))).toEqual(FILE_BODY);
      expect(fs.existsSync(path.join(workRoot, "ok", "timelines", "hook.timeline.json"))).toBe(true);
      expect(reported.at(-1)).toEqual({ stage: "sync", percent: 100 });
      expect(fs.existsSync(path.join(workRoot, "ok", "manifest.local.json"))).toBe(true);
    } finally {
      server.close();
    }
  }, 15_000);

  it("refetches once on hash mismatch and then errors cleanly", async () => {
    let hits = 0;
    const { server, url } = await startFileServer(() => {
      hits += 1;
      // First response is corrupted; retry returns correct content.
      return hits % 2 === 1 ? Buffer.from("corrompido") : FILE_BODY;
    });
    const { ctx } = makeCtx(path.join(workRoot, "retry"));
    try {
      const result = await syncInputs(
        ctx,
        [{ path: "audio/a.wav", sha256: sha256(FILE_BODY), bytes: FILE_BODY.length }],
        { baseUrl: url, videoId: "vid-1", bearerToken: "pat" }
      );
      expect(result.refetched).toBe(1);
      expect(fs.readFileSync(path.join(workRoot, "retry", "audio", "a.wav"))).toEqual(FILE_BODY);
    } finally {
      server.close();
    }
  }, 15_000);

  it("fails when both attempts mismatch and never writes the file", async () => {
    const { server, url } = await startFileServer(() => Buffer.from("sempre errado"));
    const { ctx } = makeCtx(path.join(workRoot, "bad"));
    try {
      await expect(
        syncInputs(
          ctx,
          [{ path: "audio/b.wav", sha256: sha256(FILE_BODY), bytes: FILE_BODY.length }],
          { baseUrl: url, videoId: "vid-1", bearerToken: "pat" }
        )
      ).rejects.toThrow(/checksum mismatch/);
      expect(fs.existsSync(path.join(workRoot, "bad", "audio", "b.wav"))).toBe(false);
    } finally {
      server.close();
    }
  }, 15_000);
});

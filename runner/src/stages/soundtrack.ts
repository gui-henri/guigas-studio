import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { NonRetryableError } from "./errors.js";
import type { JobContext } from "./types.js";

export const DEFAULT_SOUNDTRACK_VOLUME = 0.15;

export interface SoundtrackConfig {
  fileRel: string; // e.g. "assets/soundtrack.mp3" (synced input)
  volume: number; // clamped
}

/** Pure: resolves/clamps the soundtrack config from script JSON. */
export function resolveSoundtrack(
  scriptRaw: string,
  root: string
): SoundtrackConfig | null {
  let track = "";
  let volume = DEFAULT_SOUNDTRACK_VOLUME;
  try {
    const parsed = JSON.parse(scriptRaw) as {
      soundtrack?: { track?: string; volume?: number };
    };
    if (!parsed.soundtrack?.track) return null;
    track = path.basename(parsed.soundtrack.track);
    if (typeof parsed.soundtrack.volume === "number") {
      volume = parsed.soundtrack.volume;
    }
  } catch {
    return null;
  }
  volume = Math.max(0.05, Math.min(0.5, volume));

  // Accept any synced audio extension.
  for (const ext of [".mp3", ".wav", ".m4a", ".ogg"]) {
    const rel = `assets/soundtrack${ext}`;
    if (fs.existsSync(path.join(root, rel))) {
      return { fileRel: rel, volume };
    }
  }
  throw new NonRetryableError(
    `soundtrack track "${track}" was not among the synced inputs — check assets/music on the server`
  );
}

export function ffmpegMixArgs(
  narrationWavs: readonly string[],
  soundtrackPath: string,
  outputPath: string,
  totalSeconds: number,
  volume: number
): string[] {
  const concatList = narrationWavs.map((w) => `file '${w}'`).join("\n");
  void concatList;
  // Order matters: main = music, sidechain = narration → music ducks UNDER
  // the voice. Inverting them ducks the VOICE (classic silent bug).
  return [
    "-y",
    ...(narrationWavs.length > 1 ? [] : []),
    "-i", narrationWavs[0] ?? "",
    "-stream_loop", "-1",
    "-i", soundtrackPath,
    "-filter_complex",
    `[1:a]volume=${volume}[bg];[bg][0:a]sidechaincompress=threshold=0.03:ratio=8:attack=50:release=500[duck];[duck]loudnorm[out]`,
    "-map", "[out]",
    "-t", totalSeconds.toFixed(3),
    "-ar", "48000",
    "-ac", "2",
    outputPath,
  ];
}

/**
 * S5-08 pre-render stage (between sync and bundle): when the approved script
 * declares a soundtrack AND the synced inputs carry it, produces a single
 * mixed track with sidechain ducking under the narration.
 */
export async function mixSoundtrack(ctx: JobContext): Promise<void> {
  const root = ctx.workDir(ctx.slug);
  const scriptRaw = fs.readFileSync(path.join(root, "script.json"), "utf8");
  const config = resolveSoundtrack(scriptRaw, root);
  if (!config) {
    ctx.log.info("no soundtrack declared; skipping mix");
    await ctx.report("soundtrack", 100);
    return;
  }
  await ctx.checkCancelled();

  const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
  if (!ffmpegAvailable(ffmpeg)) {
    throw new NonRetryableError(
      "ffmpeg not found on PATH (winget install Gyan.FFmpeg) — required for soundtrack mixing"
    );
  }

  const timelinesDir = path.join(root, "timelines");
  const segIds = fs
    .readdirSync(timelinesDir)
    .filter((f) => f.endsWith(".timeline.json"))
    .map((f) => f.replace(".timeline.json", ""));
  if (segIds.length === 0) {
    throw new NonRetryableError("no segment timelines found for soundtrack mix");
  }

  // Narration duration = sum of timeline durations (same math as the render).
  const totalSeconds = segIds.reduce((sum, id) => {
    const tl = JSON.parse(
      fs.readFileSync(path.join(timelinesDir, `${id}.timeline.json`), "utf8")
    ) as { durationMs?: number };
    return sum + Number(tl.durationMs ?? 0) / 1000;
  }, 0);

  // Single-segment narration feeds the sidechain directly; multi-segment jobs
  // rely on the server-side concatenation artifact when present.
  const narrationCandidates = ["audio/concat.wav", ...segIds.map((id) => `audio/${id}.wav`)];
  const narration = narrationCandidates.find((rel) => fs.existsSync(path.join(root, rel)));
  if (!narration) {
    throw new NonRetryableError("no narration audio available for soundtrack mix");
  }

  const outDir = path.join(root, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const output = path.join(outDir, "mixed.wav");

  ctx.log.info({ volume: config.volume }, "mixing soundtrack with ducking");
  const result = spawnSync(ffmpeg, ffmpegMixArgs(
    [path.join(root, narration)],
    path.join(root, config.fileRel),
    output,
    totalSeconds,
    config.volume
  ), { stdio: "pipe" });

  if (result.status !== 0 || !fs.existsSync(output)) {
    throw new NonRetryableError(
      `ffmpeg mix failed: ${result.stderr?.toString().slice(-400)}`
    );
  }
  await ctx.report("soundtrack", 100);
}

function ffmpegAvailable(bin: string): boolean {
  const probe = spawnSync(bin, ["-version"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

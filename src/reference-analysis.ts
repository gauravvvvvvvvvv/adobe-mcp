import { execFile } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { generateReviewPack, probeMedia } from "./media-review.js";

const execFileAsync = promisify(execFile);

function safeStem(path: string): string {
  return basename(path, extname(path)).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "reference";
}

async function ffmpegStderr(args: string[]): Promise<string> {
  try {
    const result = await execFileAsync("ffmpeg", args, { maxBuffer: 16 * 1024 * 1024 });
    return result.stderr ?? "";
  } catch (error) {
    const err = error as Error & { stderr?: string };
    if (typeof err.stderr === "string" && err.stderr.length) return err.stderr;
    throw error;
  }
}

function parseSceneTimes(stderr: string): number[] {
  const times: number[] = [];
  const re = /pts_time:([0-9.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stderr))) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && (times.length === 0 || Math.abs(n - times[times.length - 1]) > 0.03)) times.push(n);
  }
  return times;
}

function parseSilence(stderr: string): Array<{ start: number; end?: number; duration?: number }> {
  const events: Array<{ start: number; end?: number; duration?: number }> = [];
  const lines = stderr.split(/\r?\n/);
  let active: { start: number; end?: number; duration?: number } | null = null;
  for (const line of lines) {
    const start = line.match(/silence_start:\s*([-0-9.]+)/);
    if (start) {
      const n = Number(start[1]);
      if (Number.isFinite(n)) {
        active = { start: Math.max(0, n) };
        events.push(active);
      }
      continue;
    }
    const end = line.match(/silence_end:\s*([-0-9.]+)\s*\|\s*silence_duration:\s*([-0-9.]+)/);
    if (end && active) {
      const e = Number(end[1]);
      const d = Number(end[2]);
      if (Number.isFinite(e)) active.end = e;
      if (Number.isFinite(d)) active.duration = d;
      active = null;
    }
  }
  return events;
}

function parseLoudnorm(stderr: string): Record<string, number | string> | null {
  const matches = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!matches?.length) return null;
  try {
    const parsed = JSON.parse(matches[matches.length - 1]) as Record<string, unknown>;
    const out: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        const n = Number(value);
        out[key] = Number.isFinite(n) ? n : value;
      } else if (typeof value === "number") out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

function shotStats(duration: number, cuts: number[]) {
  const boundaries = [0, ...cuts.filter((t) => t > 0 && t < duration), duration]
    .sort((a, b) => a - b);
  const shots: Array<{ index: number; start: number; end: number; duration: number }> = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const d = boundaries[i + 1] - boundaries[i];
    if (d > 0.01) shots.push({ index: shots.length, start: boundaries[i], end: boundaries[i + 1], duration: d });
  }
  const durations = shots.map((s) => s.duration).sort((a, b) => a - b);
  const average = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : duration;
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : duration;
  return {
    shotCount: shots.length,
    averageShotSeconds: average,
    medianShotSeconds: median,
    shortestShotSeconds: durations[0] ?? duration,
    longestShotSeconds: durations.at(-1) ?? duration,
    cutsPerMinute: duration > 0 ? Math.max(0, shots.length - 1) * 60 / duration : 0,
    shots
  };
}

async function sampleFrames(input: string, outputDir: string, duration: number, maxFrames: number) {
  const framesDir = join(outputDir, safeStem(input) + ".frames");
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  const count = Math.max(2, Math.min(maxFrames, 48));
  const interval = Math.max(0.1, duration / Math.max(1, count - 1));
  const pattern = join(framesDir, "frame-%03d.jpg");
  await execFileAsync("ffmpeg", [
    "-y", "-v", "error", "-i", input,
    "-vf", `fps=1/${interval},scale='min(720,iw)':-2`,
    "-frames:v", String(count),
    "-q:v", "3",
    pattern
  ], { maxBuffer: 8 * 1024 * 1024 });
  const files = (await readdir(framesDir))
    .filter((name) => /\.jpe?g$/i.test(name))
    .sort()
    .map((name) => join(framesDir, name));
  return { framesDir, intervalSeconds: interval, frames: files };
}

export async function analyzeReference(
  inputPath: string,
  outputDir: string,
  options: {
    sceneThreshold?: number;
    silenceDb?: number;
    silenceMinSeconds?: number;
    maxFrames?: number;
    proxyWidth?: number;
  } = {}
) {
  const input = resolve(inputPath);
  const output = resolve(outputDir);
  await mkdir(output, { recursive: true });
  const probe = await probeMedia(input);
  if (!probe.durationSeconds || !probe.videoCodec) {
    throw new Error("reference_analysis_requires_video");
  }

  const threshold = Math.max(0.05, Math.min(options.sceneThreshold ?? 0.32, 0.95));
  const sceneStderr = await ffmpegStderr([
    "-hide_banner", "-i", input,
    "-vf", `select='gt(scene,${threshold})',showinfo`,
    "-an", "-f", "null", "-"
  ]);
  const sceneCuts = parseSceneTimes(sceneStderr).filter((t) => t > 0 && t < probe.durationSeconds!);

  const silenceDb = Math.min(-1, options.silenceDb ?? -35);
  const silenceMin = Math.max(0.05, options.silenceMinSeconds ?? 0.35);
  let silence: Array<{ start: number; end?: number; duration?: number }> = [];
  let loudness: Record<string, number | string> | null = null;

  if (probe.audioCodec) {
    const silenceStderr = await ffmpegStderr([
      "-hide_banner", "-i", input,
      "-af", `silencedetect=noise=${silenceDb}dB:d=${silenceMin}`,
      "-vn", "-f", "null", "-"
    ]);
    silence = parseSilence(silenceStderr);

    const loudnessStderr = await ffmpegStderr([
      "-hide_banner", "-i", input,
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
      "-vn", "-f", "null", "-"
    ]);
    loudness = parseLoudnorm(loudnessStderr);
  }

  const review = await generateReviewPack(input, output, {
    proxyWidth: options.proxyWidth ?? 960,
    contactFrames: Math.max(12, Math.min(options.maxFrames ?? 24, 36)),
    includeWaveform: true
  });
  const sampled = await sampleFrames(input, output, probe.durationSeconds, options.maxFrames ?? 24);
  const pacing = shotStats(probe.durationSeconds, sceneCuts);

  return {
    version: 1,
    input,
    probe,
    sceneDetection: {
      threshold,
      cuts: sceneCuts,
      ...pacing
    },
    audio: {
      silenceDb,
      silenceMinSeconds: silenceMin,
      silence,
      loudness
    },
    reviewArtifacts: review.artifacts,
    sampledFrames: sampled,
    warnings: review.warnings,
    modelGuidance: {
      inspectContactSheet: review.artifacts.find((a) => a.kind === "contact-sheet")?.path ?? null,
      inspectProxy: review.artifacts.find((a) => a.kind === "video-proxy")?.path ?? null,
      inspectWaveform: review.artifacts.find((a) => a.kind === "waveform")?.path ?? null,
      note: "Use shot timing statistics as pacing evidence; use sampled frames/contact sheet for visual style. Do not infer visual style from timing alone."
    }
  };
}

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface MediaProbe {
  durationSeconds?: number;
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
  channels?: number;
  videoCodec?: string;
  audioCodec?: string;
  formatName?: string;
}

function parseFrameRate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  if (value.includes("/")) {
    const [a,b] = value.split("/").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function probeMedia(path: string): Promise<MediaProbe> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v","error",
    "-show_entries","format=duration,format_name:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels",
    "-of","json",
    resolve(path)
  ], { maxBuffer: 1024 * 1024 });

  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      sample_rate?: string;
      channels?: number;
    }>;
  };

  const video = parsed.streams?.find((s) => s.codec_type === "video");
  const audio = parsed.streams?.find((s) => s.codec_type === "audio");
  const duration = Number(parsed.format?.duration);

  return {
    durationSeconds: Number.isFinite(duration) ? duration : undefined,
    width: video?.width,
    height: video?.height,
    frameRate: parseFrameRate(video?.avg_frame_rate),
    sampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined,
    channels: audio?.channels,
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    formatName: parsed.format?.format_name
  };
}

function stem(path: string): string {
  const name = basename(path, extname(path));
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 100) || "media";
}

function reviewKey(path: string): string {
  return createHash("sha1").update(resolve(path)).digest("hex").slice(0, 10);
}

async function isFreshArtifact(path: string, inputMtimeMs: number): Promise<boolean> {
  try {
    const file = await stat(path);
    return file.isFile() && file.size > 0 && file.mtimeMs >= inputMtimeMs;
  } catch {
    return false;
  }
}

export async function generateReviewPack(
  inputPath: string,
  outputDir: string,
  options: { proxyWidth?: number; contactFrames?: number; includeWaveform?: boolean; includeProxy?: boolean; includeContactSheet?: boolean; reuseExisting?: boolean } = {}
) {
  const input = resolve(inputPath);
  const output = resolve(outputDir);
  const file = await stat(input);
  if (!file.isFile()) throw new Error("review_input_not_file");
  await mkdir(output, { recursive: true });

  const probe = await probeMedia(input);
  const base = stem(input);
  const artifacts: Array<{ kind: string; path: string; cached?: boolean }> = [];
  const warnings: string[] = [];
  let cacheHits = 0;
  const reuse = options.reuseExisting !== false;

  if (probe.width && probe.height) {
    const width = Math.max(320, Math.min(options.proxyWidth ?? 1280, 1920));
    const proxyPath = join(output, base + ".review.mp4");

    if (options.includeProxy !== false) {
      if (reuse && await isFreshArtifact(proxyPath, file.mtimeMs)) {
        artifacts.push({ kind: "video-proxy", path: proxyPath, cached: true });
        cacheHits += 1;
      } else {
        try {
          await execFileAsync("ffmpeg", [
            "-y","-v","error","-i",input,
            "-vf",`scale='min(${width},iw)':-2`,
            "-c:v","libx264","-preset","veryfast","-crf","26",
            "-c:a","aac","-b:a","128k",
            "-movflags","+faststart",
            proxyPath
          ], { maxBuffer: 4 * 1024 * 1024 });
          artifacts.push({ kind: "video-proxy", path: proxyPath, cached: false });
        } catch (error) {
          warnings.push("proxy_failed:" + (error instanceof Error ? error.message : String(error)));
        }
      }
    }

    const frames = Math.max(4, Math.min(options.contactFrames ?? 16, 36));
    const cols = Math.ceil(Math.sqrt(frames));
    const rows = Math.ceil(frames / cols);
    const contactPath = join(output, base + ".contact.jpg");
    const duration = Math.max(probe.durationSeconds ?? 1, 0.1);
    const fps = Math.max(frames / duration, 0.0001);

    if (options.includeContactSheet !== false) {
      if (reuse && await isFreshArtifact(contactPath, file.mtimeMs)) {
        artifacts.push({ kind: "contact-sheet", path: contactPath, cached: true });
        cacheHits += 1;
      } else {
        try {
          await execFileAsync("ffmpeg", [
            "-y","-v","error","-i",input,
            "-vf",`fps=${fps},scale=320:-2,tile=${cols}x${rows}:padding=2:margin=2`,
            "-frames:v","1",
            "-q:v","3",
            contactPath
          ], { maxBuffer: 4 * 1024 * 1024 });
          artifacts.push({ kind: "contact-sheet", path: contactPath, cached: false });
        } catch (error) {
          warnings.push("contact_sheet_failed:" + (error instanceof Error ? error.message : String(error)));
        }
      }
    }
  }

  if (options.includeWaveform !== false && probe.channels) {
    const waveformPath = join(output, base + ".waveform.png");
    if (reuse && await isFreshArtifact(waveformPath, file.mtimeMs)) {
      artifacts.push({ kind: "waveform", path: waveformPath, cached: true });
      cacheHits += 1;
    } else {
      try {
        await execFileAsync("ffmpeg", [
          "-y","-v","error","-i",input,
          "-filter_complex","aformat=channel_layouts=mono,showwavespic=s=1600x320",
          "-frames:v","1",
          waveformPath
        ], { maxBuffer: 4 * 1024 * 1024 });
        artifacts.push({ kind: "waveform", path: waveformPath, cached: false });
      } catch (error) {
        warnings.push("waveform_failed:" + (error instanceof Error ? error.message : String(error)));
      }
    }
  }

  if (!artifacts.length) throw new Error("no_review_artifacts_generated");
  return { input, probe, artifacts, warnings, cacheHits };
}

export async function generateAssetReviewPacks(
  inputPaths: string[],
  outputDir: string,
  options: {
    maxAssets?: number;
    proxyWidth?: number;
    contactFrames?: number;
    includeWaveform?: boolean;
    includeProxy?: boolean;
    includeContactSheet?: boolean;
    reuseExisting?: boolean;
  } = {}
) {
  const unique = [...new Set(inputPaths.map((path) => resolve(path)))];
  const maxAssets = Math.max(1, Math.min(options.maxAssets ?? 12, 32));
  const selected = unique.slice(0, maxAssets);
  const items = [];

  for (const input of selected) {
    const perAssetDir = join(resolve(outputDir), stem(input) + "-" + reviewKey(input));
    try {
      items.push(await generateReviewPack(input, perAssetDir, {
        proxyWidth: options.proxyWidth ?? 720,
        contactFrames: options.contactFrames ?? 9,
        includeWaveform: options.includeWaveform === true,
        includeProxy: options.includeProxy === true,
        includeContactSheet: options.includeContactSheet !== false,
        reuseExisting: options.reuseExisting !== false
      }));
    } catch (error) {
      items.push({
        input,
        probe: null,
        artifacts: [],
        warnings: ["review_failed:" + (error instanceof Error ? error.message : String(error))],
        cacheHits: 0
      });
    }
  }

  return {
    requested: unique.length,
    reviewed: items.length,
    truncated: unique.length > selected.length,
    cacheHits: items.reduce((sum, item) => sum + Number(item.cacheHits || 0), 0),
    items,
    tokenHint: "Inspect contact sheets first. Request video proxies only for clips that survive visual shortlisting."
  };
}

export async function validateMediaOutput(
  path: string,
  expected: {
    width?: number;
    height?: number;
    fps?: number;
    durationSeconds?: number;
    durationToleranceSeconds?: number;
    videoCodec?: string;
    audioRequired?: boolean;
    minSizeBytes?: number;
  } = {}
) {
  const absolute = resolve(path);
  const issues: string[] = [];
  const warnings: string[] = [];
  let file;

  try {
    file = await stat(absolute);
  } catch {
    return { ok: false, path: absolute, issues: ["output_missing"], warnings, probe: null };
  }

  if (!file.isFile()) issues.push("output_not_file");
  const minSize = Math.max(1, expected.minSizeBytes ?? 1024);
  if (file.size < minSize) issues.push(`output_too_small:${file.size}<${minSize}`);

  let probe: MediaProbe | null = null;
  try {
    probe = await probeMedia(absolute);
  } catch (error) {
    issues.push("ffprobe_failed:" + (error instanceof Error ? error.message : String(error)));
  }

  if (probe) {
    if (expected.width !== undefined && probe.width !== expected.width) issues.push(`width:${probe.width ?? "none"}!=${expected.width}`);
    if (expected.height !== undefined && probe.height !== expected.height) issues.push(`height:${probe.height ?? "none"}!=${expected.height}`);

    if (expected.fps !== undefined) {
      if (probe.frameRate === undefined) issues.push("fps_missing");
      else if (Math.abs(probe.frameRate - expected.fps) > 0.02) issues.push(`fps:${probe.frameRate}!=${expected.fps}`);
    }

    if (expected.durationSeconds !== undefined) {
      const tolerance = Math.max(0, expected.durationToleranceSeconds ?? 0.25);
      if (probe.durationSeconds === undefined) issues.push("duration_missing");
      else if (Math.abs(probe.durationSeconds - expected.durationSeconds) > tolerance) {
        issues.push(`duration:${probe.durationSeconds}!=${expected.durationSeconds}±${tolerance}`);
      }
    }

    if (expected.videoCodec && probe.videoCodec?.toLowerCase() !== expected.videoCodec.toLowerCase()) {
      issues.push(`video_codec:${probe.videoCodec ?? "none"}!=${expected.videoCodec}`);
    }
    if (expected.audioRequired && !probe.audioCodec) issues.push("audio_stream_missing");
    if (!probe.videoCodec && !probe.audioCodec) issues.push("no_media_streams");
    if (!expected.audioRequired && !probe.audioCodec) warnings.push("no_audio_stream");
  }

  return {
    ok: issues.length === 0,
    path: absolute,
    sizeBytes: file.size,
    probe,
    issues,
    warnings
  };
}

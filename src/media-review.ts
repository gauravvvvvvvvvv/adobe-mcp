import { execFile } from "node:child_process";
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

export async function generateReviewPack(
  inputPath: string,
  outputDir: string,
  options: { proxyWidth?: number; contactFrames?: number; includeWaveform?: boolean } = {}
) {
  const input = resolve(inputPath);
  const output = resolve(outputDir);
  const file = await stat(input);
  if (!file.isFile()) throw new Error("review_input_not_file");
  await mkdir(output, { recursive: true });

  const probe = await probeMedia(input);
  const base = stem(input);
  const artifacts: Array<{ kind: string; path: string }> = [];
  const warnings: string[] = [];

  if (probe.width && probe.height) {
    const width = Math.max(320, Math.min(options.proxyWidth ?? 1280, 1920));
    const proxyPath = join(output, base + ".review.mp4");

    try {
      await execFileAsync("ffmpeg", [
        "-y","-v","error","-i",input,
        "-vf",`scale='min(${width},iw)':-2`,
        "-c:v","libx264","-preset","veryfast","-crf","26",
        "-c:a","aac","-b:a","128k",
        "-movflags","+faststart",
        proxyPath
      ], { maxBuffer: 4 * 1024 * 1024 });
      artifacts.push({ kind: "video-proxy", path: proxyPath });
    } catch (error) {
      warnings.push("proxy_failed:" + (error instanceof Error ? error.message : String(error)));
    }

    const frames = Math.max(4, Math.min(options.contactFrames ?? 16, 36));
    const cols = Math.ceil(Math.sqrt(frames));
    const rows = Math.ceil(frames / cols);
    const contactPath = join(output, base + ".contact.jpg");
    const duration = Math.max(probe.durationSeconds ?? 1, 0.1);
    const fps = Math.max(frames / duration, 0.0001);

    try {
      await execFileAsync("ffmpeg", [
        "-y","-v","error","-i",input,
        "-vf",`fps=${fps},scale=320:-2,tile=${cols}x${rows}:padding=2:margin=2`,
        "-frames:v","1",
        "-q:v","3",
        contactPath
      ], { maxBuffer: 4 * 1024 * 1024 });
      artifacts.push({ kind: "contact-sheet", path: contactPath });
    } catch (error) {
      warnings.push("contact_sheet_failed:" + (error instanceof Error ? error.message : String(error)));
    }
  }

  if (options.includeWaveform !== false && probe.channels) {
    const waveformPath = join(output, base + ".waveform.png");
    try {
      await execFileAsync("ffmpeg", [
        "-y","-v","error","-i",input,
        "-filter_complex","aformat=channel_layouts=mono,showwavespic=s=1600x320",
        "-frames:v","1",
        waveformPath
      ], { maxBuffer: 4 * 1024 * 1024 });
      artifacts.push({ kind: "waveform", path: waveformPath });
    } catch (error) {
      warnings.push("waveform_failed:" + (error instanceof Error ? error.message : String(error)));
    }
  }

  if (!artifacts.length) throw new Error("no_review_artifacts_generated");
  return { input, probe, artifacts, warnings };
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

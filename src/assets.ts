import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

const VIDEO = new Set([".mp4",".mov",".mxf",".m4v",".avi",".webm",".mts",".m2ts",".mpg",".mpeg"]);
const AUDIO = new Set([".wav",".mp3",".aac",".m4a",".flac",".aiff",".aif",".ogg"]);
const IMAGE = new Set([".jpg",".jpeg",".png",".webp",".tif",".tiff",".gif",".bmp",".heic",".psd",".psb"]);
const VECTOR = new Set([".ai",".svg",".eps",".pdf"]);
const PROJECT = new Set([".prproj",".aep",".aepx",".psd",".psb",".ai",".indd",".idml",".fla"]);

export interface IndexedAsset {
  path: string;
  name: string;
  extension: string;
  mediaType: "video" | "audio" | "image" | "vector" | "project" | "other";
  sizeBytes: number;
  modifiedAt: string;
  sha256?: string;
  probe?: {
    durationSeconds?: number;
    width?: number;
    height?: number;
    frameRate?: number;
    sampleRate?: number;
    channels?: number;
    codec?: string;
  };
}

function mediaType(extension: string): IndexedAsset["mediaType"] {
  if (VIDEO.has(extension)) return "video";
  if (AUDIO.has(extension)) return "audio";
  if (PROJECT.has(extension)) return "project";
  if (IMAGE.has(extension)) return "image";
  if (VECTOR.has(extension)) return "vector";
  return "other";
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function sha256(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
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

async function ffprobe(path: string): Promise<IndexedAsset["probe"] | undefined> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v","error",
      "-show_entries","format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels",
      "-of","json",
      path
    ], { maxBuffer: 1024 * 1024 });

    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string };
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
      codec: video?.codec_name ?? audio?.codec_name
    };
  } catch {
    return undefined;
  }
}

async function collect(paths: string[], recursive: boolean, maxAssets: number): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();

  async function visit(input: string): Promise<void> {
    if (out.length >= maxAssets) return;
    const absolute = resolve(input);
    if (seen.has(absolute) || !(await exists(absolute))) return;
    seen.add(absolute);

    const s = await stat(absolute);
    if (s.isFile()) {
      out.push(absolute);
      return;
    }
    if (!s.isDirectory()) return;

    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      if (out.length >= maxAssets) break;
      const child = resolve(absolute, entry.name);
      if (entry.isFile()) out.push(child);
      else if (recursive && entry.isDirectory()) await visit(child);
    }
  }

  for (const path of paths) {
    if (out.length >= maxAssets) break;
    await visit(path);
  }
  return out.slice(0, maxAssets);
}

export async function indexAssets(
  paths: string[],
  options: { recursive?: boolean; maxAssets?: number; hash?: boolean; probe?: boolean } = {}
) {
  const recursive = options.recursive ?? true;
  const maxAssets = Math.max(1, Math.min(options.maxAssets ?? 500, 5000));
  const doHash = options.hash ?? false;
  const doProbe = options.probe ?? true;
  const files = await collect(paths, recursive, maxAssets);
  const assets: IndexedAsset[] = [];

  for (const path of files) {
    const s = await stat(path);
    const extension = extname(path).toLowerCase();
    const type = mediaType(extension);
    assets.push({
      path,
      name: path.split(/[\\/]/).pop() ?? path,
      extension,
      mediaType: type,
      sizeBytes: s.size,
      modifiedAt: s.mtime.toISOString(),
      sha256: doHash ? await sha256(path) : undefined,
      probe: doProbe && (type === "video" || type === "audio") ? await ffprobe(path) : undefined
    });
  }

  const counts = assets.reduce<Record<string, number>>((acc, asset) => {
    acc[asset.mediaType] = (acc[asset.mediaType] ?? 0) + 1;
    return acc;
  }, {});

  return { assets, counts, truncated: files.length >= maxAssets, ffprobeOptional: true };
}

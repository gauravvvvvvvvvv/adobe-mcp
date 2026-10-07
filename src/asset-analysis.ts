import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { indexAssets, type IndexedAsset } from "./assets.js";

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".gif", ".bmp", ".heic", ".psd", ".psb"]);
const VIDEO = new Set([".mp4", ".mov", ".mxf", ".m4v", ".avi", ".webm", ".mts", ".m2ts", ".mpg", ".mpeg"]);
const AUDIO = new Set([".wav", ".mp3", ".aac", ".m4a", ".flac", ".aiff", ".aif", ".ogg"]);

export interface AssetFingerprint {
  algorithm: "dhash64" | "audio-sha256";
  value: string;
  sampledAtSeconds?: number;
}

export interface AnalyzedAsset extends IndexedAsset {
  fingerprint?: AssetFingerprint;
  exactSha256?: string;
  cacheHit: boolean;
}

function cacheRoot(): string {
  return process.env.ADOBE_MCP_ASSET_CACHE_DIR ?? join(homedir(), ".adobe-mcp", "asset-analysis");
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

function cacheKey(path: string, size: number, modifiedMs: number): string {
  return createHash("sha256")
    .update(path)
    .update("\0")
    .update(String(size))
    .update("\0")
    .update(String(modifiedMs))
    .digest("hex");
}

async function runBinary(command: string, args: string[], maxBytes: number): Promise<Buffer> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let overflow = false;

    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        overflow = true;
        child.kill("SIGKILL");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (overflow) {
        reject(new Error(command + "_output_too_large"));
        return;
      }
      if (code === 0) {
        resolveRun(Buffer.concat(stdout));
        return;
      }
      reject(new Error(
        command + " failed (" + String(code ?? signal) + "): " +
        Buffer.concat(stderr).toString("utf8").slice(0, 2000)
      ));
    });
  });
}

function dHash64(pixels: Buffer): string {
  if (pixels.length < 72) throw new Error("dhash_frame_too_small");
  let bits = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (pixels[y * 9 + x] > pixels[y * 9 + x + 1]) bits |= 1n << bit;
      bit += 1n;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

async function visualFingerprint(path: string, duration?: number): Promise<AssetFingerprint> {
  const sampledAtSeconds = duration && duration > 0
    ? Math.min(Math.max(duration * 0.5, 0), Math.max(duration - 0.01, 0))
    : 0;
  const args = ["-v", "error"];
  if (sampledAtSeconds > 0) args.push("-ss", String(sampledAtSeconds));
  args.push(
    "-i", path,
    "-frames:v", "1",
    "-vf", "scale=9:8:flags=area,format=gray",
    "-f", "rawvideo",
    "pipe:1"
  );
  const pixels = await runBinary("ffmpeg", args, 4096);
  return { algorithm: "dhash64", value: dHash64(pixels), sampledAtSeconds };
}

async function audioFingerprint(path: string): Promise<AssetFingerprint> {
  const pcm = await runBinary("ffmpeg", [
    "-v", "error",
    "-i", path,
    "-t", "30",
    "-vn",
    "-ac", "1",
    "-ar", "8000",
    "-f", "s16le",
    "pipe:1"
  ], 30 * 8000 * 2 + 4096);
  return {
    algorithm: "audio-sha256",
    value: createHash("sha256").update(pcm).digest("hex")
  };
}

function hammingHex(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let value = BigInt("0x" + a) ^ BigInt("0x" + b);
  let count = 0;
  while (value !== 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

async function analyzeOne(asset: IndexedAsset, exactHash: boolean): Promise<AnalyzedAsset> {
  const absolute = resolve(asset.path);
  const info = await stat(absolute);
  const key = cacheKey(absolute, info.size, info.mtimeMs);
  const cachePath = join(cacheRoot(), key + ".json");

  try {
    const cached = JSON.parse(await readFile(cachePath, "utf8")) as AnalyzedAsset;
    if (!exactHash || cached.exactSha256) return { ...cached, cacheHit: true };
  } catch {}

  const extension = extname(absolute).toLowerCase();
  let fingerprint: AssetFingerprint | undefined;
  try {
    if (VIDEO.has(extension) || IMAGE.has(extension)) {
      fingerprint = await visualFingerprint(absolute, asset.probe?.durationSeconds);
    } else if (AUDIO.has(extension)) {
      fingerprint = await audioFingerprint(absolute);
    }
  } catch {
    // Fingerprints are optional. Metadata and exact hashing remain useful when ffmpeg
    // is unavailable or cannot decode a particular Adobe/native media format.
  }

  const analyzed: AnalyzedAsset = {
    ...asset,
    path: absolute,
    fingerprint,
    exactSha256: exactHash ? await sha256(absolute) : undefined,
    cacheHit: false
  };

  await mkdir(cacheRoot(), { recursive: true });
  await writeFile(cachePath, JSON.stringify(analyzed), "utf8");
  return analyzed;
}

export async function analyzeAssets(
  paths: string[],
  options: {
    recursive?: boolean;
    maxAssets?: number;
    exactHash?: boolean;
    nearDuplicateDistance?: number;
  } = {}
) {
  const indexed = await indexAssets(paths, {
    recursive: options.recursive ?? true,
    maxAssets: options.maxAssets ?? 500,
    hash: false,
    probe: true
  });

  const analyzed: AnalyzedAsset[] = [];
  for (const asset of indexed.assets) {
    analyzed.push(await analyzeOne(asset, options.exactHash === true));
  }

  const exactGroups = new Map<string, string[]>();
  for (const asset of analyzed) {
    if (!asset.exactSha256) continue;
    const group = exactGroups.get(asset.exactSha256) ?? [];
    group.push(asset.path);
    exactGroups.set(asset.exactSha256, group);
  }

  const threshold = Math.max(0, Math.min(options.nearDuplicateDistance ?? 5, 16));
  const visual = analyzed.filter((asset) => asset.fingerprint?.algorithm === "dhash64");
  const nearDuplicatePairs: Array<{ a: string; b: string; distance: number }> = [];
  for (let i = 0; i < visual.length; i += 1) {
    for (let j = i + 1; j < visual.length; j += 1) {
      const distance = hammingHex(visual[i].fingerprint!.value, visual[j].fingerprint!.value);
      if (distance <= threshold) {
        nearDuplicatePairs.push({ a: visual[i].path, b: visual[j].path, distance });
      }
    }
  }

  return {
    assets: analyzed,
    counts: indexed.counts,
    truncated: indexed.truncated,
    cacheHits: analyzed.filter((asset) => asset.cacheHit).length,
    exactDuplicateGroups: [...exactGroups.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([sha256, duplicatePaths]) => ({ sha256, paths: duplicatePaths })),
    nearDuplicatePairs,
    nearDuplicateDistance: threshold,
    fingerprinting: {
      visual: "64-bit difference hash from a 9x8 grayscale representative frame",
      audio: "SHA-256 of the first 30 seconds normalized to mono 8 kHz signed 16-bit PCM",
      optional: true
    },
    tokenHint: "Use this compact manifest to shortlist sources. Generate/open visual review artifacts only for shortlisted media instead of repeatedly ingesting full-resolution files."
  };
}

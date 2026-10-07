import { spawn } from "node:child_process";
import { resolve } from "node:path";

interface AudioAnalysisOptions {
  sampleRate?: number;
  frameMs?: number;
  silenceDb?: number;
  minSilenceSeconds?: number;
  minOnsetSpacingSeconds?: number;
  onsetSensitivity?: number;
  maxSeconds?: number;
  maxOnsets?: number;
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a,b) => a-b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function extractMonoPcm(path: string, sampleRate: number, maxSeconds?: number): Promise<Buffer> {
  return new Promise((resolvePcm, reject) => {
    const args = ["-hide_banner","-loglevel","error","-i",resolve(path),"-vn","-ac","1","-ar",String(sampleRate)];
    if (maxSeconds && Number.isFinite(maxSeconds)) args.push("-t",String(Math.max(0.1,maxSeconds)));
    args.push("-f","s16le","pipe:1");

    const child = spawn("ffmpeg", args, { stdio: ["ignore","pipe","pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    const maxBytes = 256 * 1024 * 1024;

    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        child.kill();
        reject(new Error("audio_analysis_pcm_too_large"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("ffmpeg_audio_extract_failed:" + Buffer.concat(stderr).toString("utf8").slice(0,2000)));
        return;
      }
      resolvePcm(Buffer.concat(stdout));
    });
  });
}

function frameRms(pcm: Buffer, samplesPerFrame: number): number[] {
  const samples = Math.floor(pcm.length / 2);
  const frames: number[] = [];
  for (let start = 0; start < samples; start += samplesPerFrame) {
    const end = Math.min(samples, start + samplesPerFrame);
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      const value = pcm.readInt16LE(i * 2) / 32768;
      sum += value * value;
      count += 1;
    }
    frames.push(count ? Math.sqrt(sum / count) : 0);
  }
  return frames;
}

function silenceRegions(
  rms: number[],
  frameSeconds: number,
  thresholdDb: number,
  minSeconds: number
) {
  const threshold = Math.pow(10, thresholdDb / 20);
  const minFrames = Math.max(1, Math.ceil(minSeconds / frameSeconds));
  const regions: Array<{ start: number; end: number; duration: number }> = [];
  let start = -1;

  for (let i = 0; i <= rms.length; i++) {
    const silent = i < rms.length && rms[i] <= threshold;
    if (silent && start < 0) start = i;
    if ((!silent || i === rms.length) && start >= 0) {
      const frames = i - start;
      if (frames >= minFrames) {
        const from = start * frameSeconds;
        const to = i * frameSeconds;
        regions.push({ start: from, end: to, duration: to - from });
      }
      start = -1;
    }
  }
  return regions;
}

function onsetCandidates(
  rms: number[],
  frameSeconds: number,
  sensitivity: number,
  minSpacing: number,
  maxOnsets: number
) {
  const flux = rms.map((value, index) => index === 0 ? 0 : Math.max(0, value - rms[index - 1]));
  const radius = Math.max(2, Math.round(0.35 / frameSeconds));
  const raw: Array<{ time: number; strength: number }> = [];

  for (let i = 1; i < flux.length - 1; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(flux.length, i + radius + 1);
    let mean = 0;
    for (let j = lo; j < hi; j++) mean += flux[j];
    mean /= Math.max(1, hi - lo);
    const threshold = mean * sensitivity + 0.0025;
    if (flux[i] < threshold || flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
    raw.push({ time: i * frameSeconds, strength: flux[i] });
  }

  const picked: typeof raw = [];
  for (const candidate of raw) {
    const previous = picked[picked.length - 1];
    if (!previous || candidate.time - previous.time >= minSpacing) {
      picked.push(candidate);
    } else if (candidate.strength > previous.strength) {
      picked[picked.length - 1] = candidate;
    }
    if (picked.length >= maxOnsets) break;
  }
  return picked;
}

function tempoEstimate(onsets: Array<{ time: number }>) {
  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    let interval = onsets[i].time - onsets[i - 1].time;
    if (interval < 0.18 || interval > 2) continue;
    while (interval < 0.3) interval *= 2;
    while (interval > 0.75) interval /= 2;
    intervals.push(interval);
  }
  const med = median(intervals);
  if (!med) return { bpm: null, confidence: 0, intervalSeconds: null };
  const bpm = 60 / med;
  const deviations = intervals.map((value) => Math.abs(value - med) / med);
  const mad = median(deviations) ?? 1;
  return {
    bpm: Math.round(bpm * 10) / 10,
    confidence: Math.max(0, Math.min(1, 1 - mad * 2)),
    intervalSeconds: med
  };
}

export async function analyzeAudioRhythm(path: string, options: AudioAnalysisOptions = {}) {
  const sampleRate = Math.max(2000, Math.min(options.sampleRate ?? 8000, 48000));
  const frameMs = Math.max(10, Math.min(options.frameMs ?? 20, 100));
  const samplesPerFrame = Math.max(1, Math.round(sampleRate * frameMs / 1000));
  const pcm = await extractMonoPcm(path, sampleRate, options.maxSeconds);
  const rms = frameRms(pcm, samplesPerFrame);
  const frameSeconds = samplesPerFrame / sampleRate;
  const durationSeconds = rms.length * frameSeconds;
  const silenceDb = Math.min(-1, options.silenceDb ?? -40);
  const silence = silenceRegions(rms, frameSeconds, silenceDb, Math.max(0.05, options.minSilenceSeconds ?? 0.35));
  const onsets = onsetCandidates(
    rms,
    frameSeconds,
    Math.max(1.05, Math.min(options.onsetSensitivity ?? 1.8, 5)),
    Math.max(0.08, options.minOnsetSpacingSeconds ?? 0.18),
    Math.max(1, Math.min(options.maxOnsets ?? 5000, 20000))
  );
  const tempo = tempoEstimate(onsets);
  const peak = rms.reduce((max,value) => Math.max(max,value),0);
  const average = rms.reduce((sum,value) => sum + value,0) / Math.max(1,rms.length);

  return {
    input: resolve(path),
    durationSeconds,
    sampleRate,
    frameMs,
    level: {
      peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
      averageRmsDb: average > 0 ? 20 * Math.log10(average) : -Infinity
    },
    silence: {
      thresholdDb: silenceDb,
      regions: silence
    },
    rhythm: {
      onsets,
      tempoBpmEstimate: tempo.bpm,
      tempoConfidence: tempo.confidence,
      medianBeatIntervalSeconds: tempo.intervalSeconds
    },
    tokenHint: "Use onset timestamps/tempo for beat-aware edit planning; use silence regions to avoid dialogue/music cuts in dead air without decoding audio in the model."
  };
}

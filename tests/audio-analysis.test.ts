import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { analyzeAudioRhythm } from "../src/audio-analysis.js";

const execFileAsync = promisify(execFile);

function hasFfmpeg(): boolean {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; }
  catch { return false; }
}

test("audio analysis extracts silence/onsets and a plausible tempo from pulse audio", {
  skip: !hasFfmpeg(),
  timeout: 30_000
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-audio-"));
  const input = join(root, "pulses.wav");
  try {
    await execFileAsync("ffmpeg", [
      "-y","-v","error",
      "-f","lavfi",
      "-i","aevalsrc=if(lt(mod(t\\,0.5)\\,0.08)\\,0.7*sin(2*PI*440*t)\\,0):s=8000:d=4",
      "-c:a","pcm_s16le",
      input
    ], { maxBuffer: 4 * 1024 * 1024 });

    const analysis = await analyzeAudioRhythm(input, {
      onsetSensitivity: 1.25,
      minOnsetSpacingSeconds: 0.25,
      minSilenceSeconds: 0.15
    });
    assert.ok(analysis.durationSeconds > 3.8);
    assert.ok(analysis.rhythm.onsets.length >= 5);
    assert.ok((analysis.rhythm.tempoBpmEstimate ?? 0) >= 100);
    assert.ok((analysis.rhythm.tempoBpmEstimate ?? 0) <= 140);
    assert.ok(analysis.silence.regions.length >= 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

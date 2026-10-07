import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { generateReviewPack, validateMediaOutput } from "../src/media-review.js";

const execFileAsync = promisify(execFile);

function has(command: string): boolean {
  try {
    execFileSync(command, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("media review generates proxy/contact/waveform and validates streams", {
  skip: !has("ffmpeg") || !has("ffprobe"),
  timeout: 30_000
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-media-"));
  const input = join(root, "fixture.mp4");
  const reviewDir = join(root, "review");

  await execFileAsync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
    "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    input
  ], { maxBuffer: 4 * 1024 * 1024 });

  const validation = await validateMediaOutput(input, {
    width: 320,
    height: 180,
    fps: 24,
    durationSeconds: 2,
    durationToleranceSeconds: 0.2,
    audioRequired: true,
    minSizeBytes: 1000
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.probe?.width, 320);
  assert.ok(validation.probe?.audioCodec);

  const pack = await generateReviewPack(input, reviewDir, {
    proxyWidth: 480,
    contactFrames: 9,
    includeWaveform: true
  });
  const kinds = new Set(pack.artifacts.map((artifact) => artifact.kind));
  assert.ok(kinds.has("video-proxy"));
  assert.ok(kinds.has("contact-sheet"));
  assert.ok(kinds.has("waveform"));

  for (const artifact of pack.artifacts) {
    assert.ok((await stat(artifact.path)).size > 0);
  }
});

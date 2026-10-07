import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { analyzeReference } from "../src/reference-analysis.js";

const execFileAsync = promisify(execFile);

function hasCommand(command: string): boolean {
  try {
    execFileSync(command, ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("reference analyzer extracts pacing and review artifacts from synthetic video", {
  skip: !hasCommand("ffmpeg") || !hasCommand("ffprobe"),
  timeout: 30_000
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-reference-"));
  const input = join(root, "reference.mp4");
  const review = join(root, "review");

  await execFileAsync("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", "color=c=red:s=320x180:d=1:r=24",
    "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=1:r=24",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
    "-map", "[v]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    input
  ], { maxBuffer: 4 * 1024 * 1024 });

  const result = await analyzeReference(input, review, {
    sceneThreshold: 0.2,
    maxFrames: 6,
    proxyWidth: 480
  });

  assert.ok(result.probe.durationSeconds && result.probe.durationSeconds > 1.8);
  assert.ok(result.sceneDetection.shotCount >= 2);
  assert.ok(result.sceneDetection.cuts.some((t) => t > 0.7 && t < 1.3));
  assert.ok(result.sampledFrames.frames.length >= 2);
  assert.ok(result.reviewArtifacts.some((a) => a.kind === "video-proxy"));
  assert.ok(result.reviewArtifacts.some((a) => a.kind === "contact-sheet"));

  for (const artifact of result.reviewArtifacts) {
    const info = await stat(artifact.path);
    assert.ok(info.size > 0);
  }
});

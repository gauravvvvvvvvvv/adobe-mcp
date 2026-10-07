import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("real-host acceptance runner enforces destructive safety and visual review gate", async () => {
  const source = await readFile("src/acceptance-runner.ts", "utf8");
  assert.match(source, /confirmDisposable: z\.literal\(true\)/);
  assert.match(source, /confirmOverwriteOutput/);
  assert.match(source, /checkpointRequired: true/);
  assert.match(source, /creative_job_failed/);
  assert.match(source, /premiere\.master-edit/);
  assert.match(source, /creative\.output\.validate/);
  assert.match(source, /creative\.preview\.generate/);
  assert.match(source, /creative\.repair\.plan/);
  assert.match(source, /technical_output_validation_failed/);
  assert.match(source, /awaiting_human_or_agent_visual_review/);
  assert.doesNotMatch(source, /verdict:\s*"pass"/);
});

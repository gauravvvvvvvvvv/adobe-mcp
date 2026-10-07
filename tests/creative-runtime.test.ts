import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreativeRuntime } from "../src/creative-runtime.js";

function spec(workingFile: string) {
  return {
    version: 1 as const,
    title: "Runtime safety",
    prompt: "Test durable job state",
    workingFiles: [workingFile],
    assets: [],
    references: [],
    intent: { style: [], constraints: [] },
    deliverables: [{ id: "out", outputPath: workingFile + ".out", kind: "other" as const }],
    acceptanceCriteria: [{ id: "exists", description: "Working file remains restorable", required: true }],
    operations: [],
    review: {
      required: true,
      maxPasses: 2,
      requireVisualReview: false,
      requireAudioReview: false,
      requireTechnicalValidation: false
    }
  };
}

test("creative jobs checkpoint, restore and register artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-jobs-"));
  process.env.ADOBE_MCP_JOBS_DIR = join(root, "jobs");
  process.env.ADOBE_MCP_CHECKPOINTS_DIR = join(root, "checkpoints");

  const working = join(root, "project.prproj");
  const artifactPath = join(root, "preview.txt");
  await writeFile(working, "version-one", "utf8");
  await writeFile(artifactPath, "preview", "utf8");

  const runtime = new CreativeRuntime({} as never);
  const created = await runtime.execute("creative.job.create", { spec: spec(working) }) as any;
  const jobId = created.job.id as string;

  const checkpointed = await runtime.execute("creative.job.checkpoint", { jobId }) as any;
  assert.equal(checkpointed.checkpoint.files.length, 1);
  assert.equal(checkpointed.job.checkpointCount, 1);

  await writeFile(working, "version-two", "utf8");
  const restored = await runtime.execute("creative.job.restore", {
    jobId,
    checkpointId: checkpointed.checkpoint.id,
    confirm: true
  }) as any;
  assert.equal(restored.ok, true);
  assert.equal(await readFile(working, "utf8"), "version-one");

  const registered = await runtime.execute("creative.job.artifact", {
    jobId,
    path: artifactPath,
    kind: "text-preview",
    role: "review"
  }) as any;
  assert.equal(registered.artifact.kind, "text-preview");
  assert.equal(registered.job.artifactCount, 1);
  assert.match(registered.artifact.sha256, /^[a-f0-9]{64}$/);
});

test("creative job refuses to replay an unknown-outcome operation by default", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-unknown-"));
  process.env.ADOBE_MCP_JOBS_DIR = join(root, "jobs");
  process.env.ADOBE_MCP_CHECKPOINTS_DIR = join(root, "checkpoints");
  const working = join(root, "project.prproj");
  await writeFile(working, "safe", "utf8");

  const runtime = new CreativeRuntime({} as never);
  const editable = spec(working);
  editable.operations = [{
    id: "op-1",
    phase: "assembly",
    capability: "premiere.timeline.edit",
    params: { operation: "delete" },
    required: true
  }];
  const created = await runtime.execute("creative.job.create", { spec: editable }) as any;
  const jobId = created.job.id as string;
  const path = join(process.env.ADOBE_MCP_JOBS_DIR!, jobId + ".json");
  const stored = JSON.parse(await readFile(path, "utf8"));
  stored.operationResults.push({
    operationId: "op-1",
    capability: "premiere.timeline.edit",
    status: "running",
    startedAt: new Date().toISOString()
  });
  await writeFile(path, JSON.stringify(stored), "utf8");

  const resumed = await runtime.execute("creative.job.run", {
    jobId,
    checkpoint: false
  }) as any;
  assert.equal(resumed.ok, false);
  assert.equal(resumed.error, "operation_outcome_unknown");
  assert.equal(resumed.unknown.operationId, "op-1");
});

test("passing review requires all required acceptance criteria", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-review-"));
  process.env.ADOBE_MCP_JOBS_DIR = join(root, "jobs");
  process.env.ADOBE_MCP_CHECKPOINTS_DIR = join(root, "checkpoints");
  const working = join(root, "project.prproj");
  await writeFile(working, "safe", "utf8");

  const runtime = new CreativeRuntime({} as never);
  const created = await runtime.execute("creative.job.create", { spec: spec(working) }) as any;
  await assert.rejects(
    () => runtime.execute("creative.job.review", {
      jobId: created.job.id,
      verdict: "pass",
      criteria: []
    }),
    /cannot_pass_review_missing_criteria/
  );
});


test("repair planner turns failed review criteria into targeted capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-repair-"));
  process.env.ADOBE_MCP_JOBS_DIR = join(root, "jobs");
  process.env.ADOBE_MCP_CHECKPOINTS_DIR = join(root, "checkpoints");
  const working = join(root, "project.prproj");
  await writeFile(working, "safe", "utf8");

  const runtime = new CreativeRuntime({} as never);
  const editable = spec(working);
  editable.acceptanceCriteria = [
    { id: "audio.clean", description: "Dialogue and music remain balanced without clipping", required: true },
    { id: "captions.safe", description: "Captions remain readable inside safe areas", required: true }
  ];
  const created = await runtime.execute("creative.job.create", { spec: editable }) as any;
  await runtime.execute("creative.job.review", {
    jobId: created.job.id,
    verdict: "fail",
    criteria: [
      { id: "audio.clean", verdict: "fail", note: "music buries dialogue" },
      { id: "captions.safe", verdict: "fail", note: "bottom line leaves safe area" }
    ],
    notes: "Repair both issues"
  });
  const plan = await runtime.execute("creative.repair.plan", { jobId: created.job.id }) as any;
  assert.equal(plan.ok, false);
  assert.ok(plan.failedCriteria.includes("audio.clean"));
  assert.ok(plan.directives.some((d: any) => d.suggestedCapabilities.includes("premiere.audio.mix")));
  assert.ok(plan.directives.some((d: any) => d.suggestedCapabilities.includes("premiere.captions.manage")));
});

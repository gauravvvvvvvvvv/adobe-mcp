#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as z from "zod/v4";
import { LocalBridgeBroker } from "./broker.js";
import { CreativeRuntime } from "./creative-runtime.js";
import { invokeAdobeCapability } from "./invoke.js";
import { expandRecipe } from "./recipes.js";

const clipSchema = z.object({
  path: z.string().min(1),
  sourceIn: z.number().min(0),
  sourceOut: z.number().positive(),
  at: z.number().min(0).optional(),
  videoTrack: z.number().int().min(0).optional().default(0),
  audioTrack: z.number().int().min(0).optional().default(0),
  mode: z.enum(["insert", "overwrite"]).optional().default("insert"),
  linkAudio: z.boolean().optional().default(true),
  label: z.string().optional()
}).refine((clip) => clip.sourceOut > clip.sourceIn, "sourceOut must be greater than sourceIn");

const targetSchema = z.record(z.string(), z.unknown());

const scenarioSchema = z.object({
  confirmDisposable: z.literal(true),
  confirmOverwriteOutput: z.boolean().optional().default(false),
  title: z.string().min(1).optional().default("Adobe MCP Premiere acceptance"),
  prompt: z.string().min(1).optional().default("Create and validate the configured Premiere master edit."),
  workingProject: z.string().min(1),
  sequence: z.string().optional(),
  clips: z.array(clipSchema).min(1),
  referencePath: z.string().min(1).optional(),
  outputPath: z.string().min(1).optional(),
  presetPath: z.string().min(1).optional(),
  reviewDir: z.string().min(1),
  waitForHostSeconds: z.number().int().min(5).max(600).optional().default(120),
  renderWaitSeconds: z.number().int().min(10).max(7200).optional().default(900),
  expected: z.object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    fps: z.number().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    durationToleranceSeconds: z.number().min(0).optional(),
    videoCodec: z.string().optional(),
    audioRequired: z.boolean().optional(),
    minSizeBytes: z.number().int().positive().optional()
  }).optional().default({}),
  audioTarget: targetSchema.optional(),
  levelDb: z.number().optional(),
  baseDb: z.number().optional(),
  fadeSeconds: z.number().positive().optional(),
  duckingWindows: z.array(z.record(z.string(), z.unknown())).optional(),
  gradeTarget: targetSchema.optional(),
  gradeAdjustments: z.record(z.string(), z.unknown()).optional(),
  lutPath: z.string().optional(),
  captionPath: z.string().optional(),
  captionFormat: z.string().optional(),
  mogrt: z.record(z.string(), z.unknown()).optional(),
  exerciseRepairPlanner: z.boolean().optional().default(true)
}).refine(
  (value) => (value.outputPath === undefined) === (value.presetPath === undefined),
  "outputPath and presetPath must be supplied together"
);

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function waitForPremiere(broker: LocalBridgeBroker, seconds: number) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (broker.state.get("premiere").connected) return broker.state.get("premiere");
    await sleep(500);
  }
  throw new Error(
    "premiere_adapter_timeout: open Premiere Pro with the Adobe MCP CEP extension installed. " +
    "Do not run another adobe-mcp process on port 38470 while this acceptance runner owns the broker."
  );
}

async function waitForStableFile(path: string, seconds: number) {
  const deadline = Date.now() + seconds * 1000;
  let previousSize = -1;
  let stable = 0;
  while (Date.now() < deadline) {
    const info = await stat(path).catch(() => null);
    if (info?.isFile() && info.size > 0) {
      if (info.size === previousSize) stable += 1;
      else stable = 0;
      previousSize = info.size;
      if (stable >= 3) return { path, sizeBytes: info.size };
    }
    await sleep(1500);
  }
  throw new Error("render_output_timeout:" + path);
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}

const scenarioPath = arg("--scenario");
if (!scenarioPath) {
  console.error("Usage: adobe-mcp-accept --scenario <acceptance.json>");
  process.exit(2);
}

const scenarioFile = resolve(scenarioPath);
const parsed = scenarioSchema.safeParse(JSON.parse(await readFile(scenarioFile, "utf8")));
if (!parsed.success) {
  console.error(JSON.stringify({ ok: false, error: "invalid_scenario", issues: parsed.error.issues }, null, 2));
  process.exit(2);
}
const scenario = parsed.data;
const workingProject = resolve(scenario.workingProject);
const reviewDir = resolve(scenario.reviewDir);
const outputPath = scenario.outputPath ? resolve(scenario.outputPath) : undefined;
const presetPath = scenario.presetPath ? resolve(scenario.presetPath) : undefined;

if (!(await stat(workingProject).catch(() => null))?.isFile()) throw new Error("working_project_missing:" + workingProject);
for (const clip of scenario.clips) {
  if (!(await stat(resolve(clip.path)).catch(() => null))?.isFile()) throw new Error("source_clip_missing:" + clip.path);
}
if (scenario.referencePath && !(await stat(resolve(scenario.referencePath)).catch(() => null))?.isFile()) {
  throw new Error("reference_missing:" + scenario.referencePath);
}
if (presetPath && !(await stat(presetPath).catch(() => null))?.isFile()) throw new Error("encoder_preset_missing:" + presetPath);
if (outputPath && (await stat(outputPath).catch(() => null))?.isFile() && !scenario.confirmOverwriteOutput) {
  throw new Error("output_exists_requires_confirmOverwriteOutput_true:" + outputPath);
}

await mkdir(reviewDir, { recursive: true });

const broker = new LocalBridgeBroker();
const runtime = new CreativeRuntime(broker);
const report: Record<string, unknown> = {
  startedAt: new Date().toISOString(),
  commitContract: "real-host-premiere-v1",
  scenario: scenarioFile,
  workingProject,
  reviewDir
};

try {
  await broker.start();
  report.bridgePort = broker.port;
  report.premiere = await waitForPremiere(broker, scenario.waitForHostSeconds);

  const opened = await invokeAdobeCapability(
    broker,
    "premiere",
    "premiere.project.manage",
    { operation: "open", path: workingProject },
    120_000
  );
  if (!opened.ok) throw new Error("premiere_project_open_failed:" + opened.error);
  report.projectOpen = opened.data;

  const reference = scenario.referencePath
    ? await runtime.execute("creative.reference.analyze", {
        inputPath: resolve(scenario.referencePath),
        outputDir: resolve(reviewDir, "reference")
      }, 300_000)
    : null;
  report.referenceAnalysis = reference;

  const recipe = expandRecipe("premiere.master-edit", {
    clips: scenario.clips.map((clip) => ({ ...clip, path: resolve(clip.path) })),
    sequence: scenario.sequence,
    audioTarget: scenario.audioTarget,
    levelDb: scenario.levelDb,
    baseDb: scenario.baseDb,
    fadeSeconds: scenario.fadeSeconds,
    duckingWindows: scenario.duckingWindows,
    gradeTarget: scenario.gradeTarget,
    gradeAdjustments: scenario.gradeAdjustments,
    lutPath: scenario.lutPath ? resolve(scenario.lutPath) : undefined,
    captionPath: scenario.captionPath ? resolve(scenario.captionPath) : undefined,
    captionFormat: scenario.captionFormat,
    mogrt: scenario.mogrt,
    outputPath,
    presetPath
  });

  const deliverables = outputPath
    ? [{ id: "master", outputPath, kind: "video" as const, ...scenario.expected }]
    : [{ id: "project", outputPath: workingProject, kind: "project" as const }];

  const spec = {
    version: 1 as const,
    title: scenario.title,
    prompt: scenario.prompt,
    workingFiles: [workingProject],
    assets: scenario.clips.map((clip, index) => ({
      id: "source-" + (index + 1),
      path: resolve(clip.path),
      role: "source" as const
    })),
    references: scenario.referencePath
      ? [{ id: "reference", path: resolve(scenario.referencePath), role: "reference" as const }]
      : [],
    intent: { style: [], constraints: ["Acceptance run uses an explicitly disposable project copy."] },
    deliverables,
    acceptanceCriteria: recipe.output.acceptanceCriteria,
    operations: recipe.output.operations,
    review: {
      required: true,
      maxPasses: 3,
      requireVisualReview: outputPath !== undefined,
      requireAudioReview: outputPath !== undefined && scenario.expected.audioRequired === true,
      requireTechnicalValidation: true
    }
  };

  const validation = await runtime.execute("creative.editspec.validate", { spec });
  report.editSpecValidation = validation;
  if (!(validation as { ok?: boolean }).ok) throw new Error("generated_editspec_invalid");

  const created = await runtime.execute("creative.job.create", { spec }) as { job: { id: string } };
  const jobId = created.job.id;
  report.jobId = jobId;

  const run = await runtime.execute("creative.job.run", {
    jobId,
    checkpoint: true,
    checkpointRequired: true,
    stopOnError: true
  }, 1_800_000);
  report.jobRun = run;
  if ((run as { ok?: boolean }).ok !== true) {
    throw new Error("creative_job_failed:" + JSON.stringify(run));
  }

  const context = await invokeAdobeCapability(broker, "premiere", "premiere.context.inspect", {}, 30_000);
  report.finalPremiereContext = context;

  if (outputPath) {
    report.renderFile = await waitForStableFile(outputPath, scenario.renderWaitSeconds);
    const technical = await runtime.execute("creative.output.validate", {
      jobId,
      path: outputPath,
      expected: scenario.expected,
      register: true,
      kind: "acceptance-master"
    }, 120_000);
    report.outputValidation = technical;
    const technicalOk = (technical as { ok?: boolean }).ok === true;

    const reviewPack = await runtime.execute("creative.preview.generate", {
      jobId,
      inputPath: outputPath,
      outputDir: resolve(reviewDir, "final-review"),
      proxyWidth: 1280,
      contactFrames: 20,
      includeWaveform: true
    }, 300_000);
    report.reviewPack = reviewPack;

    if (scenario.exerciseRepairPlanner) {
      const technicalObject = technical as { probe?: { width?: number } };
      const deliberatelyWrong = {
        ...scenario.expected,
        width: (scenario.expected.width ?? technicalObject.probe?.width ?? 1920) + 17
      };
      const failedValidation = await runtime.execute("creative.output.validate", {
        path: outputPath,
        expected: deliberatelyWrong,
        register: false
      }, 120_000) as Record<string, unknown>;

      report.syntheticRepairExercise = {
        deliberatelyWrongExpected: deliberatelyWrong,
        failedValidation,
        plan: await runtime.execute("creative.repair.plan", {
          criteria: recipe.output.acceptanceCriteria,
          reviewCriteria: recipe.output.acceptanceCriteria.map((criterion) => ({ id: criterion.id, verdict: "pass" })),
          notes: "Acceptance harness intentionally injected an incorrect technical delivery expectation.",
          validation: failedValidation
        })
      };
    }

    if (!technicalOk) {
      throw new Error("technical_output_validation_failed");
    }
  }

  const finalJob = await runtime.execute("creative.job.get", { jobId, full: true });
  report.finalJob = finalJob;
  report.finishedAt = new Date().toISOString();
  report.ok = true;

  const reportPath = resolve(reviewDir, "acceptance-report.json");
  await writeJson(reportPath, report);

  const artifacts = ((report.reviewPack as { artifacts?: Array<{ path?: string }> } | undefined)?.artifacts ?? []);
  const agentReviewPath = resolve(reviewDir, "AGENT_REVIEW.md");
  const reviewText = [
    "# Adobe MCP real-host review handoff",
    "",
    "Job ID: " + jobId,
    "Working project: " + workingProject,
    outputPath ? "Rendered master: " + outputPath : "No rendered master was requested.",
    "",
    "## Required next step",
    "",
    "A vision-capable Codex/Claude session must inspect the generated review artifacts and the acceptance criteria before marking this job complete. Do not infer visual quality from successful host commands.",
    "",
    "Review artifacts:",
    ...artifacts.map((artifact) => "- " + String(artifact.path ?? artifact)),
    "",
    "Acceptance criteria:",
    ...recipe.output.acceptanceCriteria.map((criterion) => "- [" + (criterion.required ? "required" : "optional") + "] " + criterion.id + ": " + criterion.description),
    "",
    "After inspection, call creative.job.review for job " + jobId + " with an explicit pass/fail verdict for every required criterion.",
    ""
  ].join("\n");
  await writeFile(agentReviewPath, reviewText, "utf8");

  console.log(JSON.stringify({
    ok: true,
    jobId,
    reportPath,
    agentReviewPath,
    outputPath,
    status: "awaiting_human_or_agent_visual_review"
  }, null, 2));
} catch (error) {
  report.ok = false;
  report.error = error instanceof Error ? error.stack ?? error.message : String(error);
  report.finishedAt = new Date().toISOString();
  await writeJson(resolve(reviewDir, "acceptance-report.failed.json"), report).catch(() => {});
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    report: resolve(reviewDir, "acceptance-report.failed.json")
  }, null, 2));
  process.exitCode = 1;
} finally {
  await broker.close();
}

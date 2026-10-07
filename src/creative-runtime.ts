import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { analyzeAssets } from "./asset-analysis.js";
import { indexAssets } from "./assets.js";
import { getCapability } from "./catalog.js";
import { editSpecSchema, validateEditSpec, type EditSpec } from "./creative-spec.js";
import {
  inspectArtifact,
  restoreCheckpointFile,
  snapshotWorkingFiles,
  type JobArtifact,
  type JobCheckpoint
} from "./job-files.js";
import { generateReviewPack, validateMediaOutput } from "./media-review.js";
import { analyzeReference } from "./reference-analysis.js";
import { planRepairs } from "./repair.js";
import { expandRecipe, listRecipes } from "./recipes.js";
import type { LocalBridgeBroker } from "./broker.js";
import { invokeAdobeCapability } from "./invoke.js";
import { runtimeLimits } from "./limits.js";
import type { AdobeApp } from "./types.js";

type JobStatus = "planned" | "executing" | "awaiting_review" | "needs_repair" | "completed" | "failed";
type OperationStatus = "running" | "succeeded" | "failed";

interface OperationResult {
  operationId: string;
  capability: string;
  status?: OperationStatus;
  ok?: boolean;
  error?: string;
  data?: unknown;
  startedAt: string;
  finishedAt?: string;
}

interface ReviewRecord {
  pass: number;
  verdict: "pass" | "fail";
  notes: string;
  criteria: Array<{ id: string; verdict: "pass" | "fail"; note?: string }>;
  artifacts: string[];
  createdAt: string;
}

interface CreativeJob {
  id: string;
  revision: number;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  spec: EditSpec;
  operationResults: OperationResult[];
  reviews: ReviewRecord[];
  notes: string[];
  artifacts?: JobArtifact[];
  checkpoints?: JobCheckpoint[];
}

function now(): string {
  return new Date().toISOString();
}

function normalizedOperationStatus(result: OperationResult): OperationStatus {
  if (result.status) return result.status;
  return result.ok === true ? "succeeded" : "failed";
}

function hydrateJob(job: CreativeJob): CreativeJob {
  job.operationResults ??= [];
  job.reviews ??= [];
  job.notes ??= [];
  job.artifacts ??= [];
  job.checkpoints ??= [];
  for (const result of job.operationResults) {
    if (!result.status) result.status = result.ok === true ? "succeeded" : "failed";
  }
  return job;
}

function compactJob(job: CreativeJob) {
  const hydrated = hydrateJob(job);
  return {
    id: hydrated.id,
    revision: hydrated.revision,
    status: hydrated.status,
    createdAt: hydrated.createdAt,
    updatedAt: hydrated.updatedAt,
    title: hydrated.spec.title,
    deliverables: hydrated.spec.deliverables,
    operationCount: hydrated.spec.operations.length,
    completedOperations: hydrated.operationResults.filter((r) => normalizedOperationStatus(r) === "succeeded").length,
    failedOperations: hydrated.operationResults.filter((r) => normalizedOperationStatus(r) === "failed").length,
    unknownOperations: hydrated.operationResults
      .filter((r) => normalizedOperationStatus(r) === "running")
      .map((r) => ({ operationId: r.operationId, capability: r.capability, startedAt: r.startedAt })),
    reviewPasses: hydrated.reviews.length,
    lastReview: hydrated.reviews.at(-1),
    artifactCount: hydrated.artifacts?.length ?? 0,
    checkpointCount: hydrated.checkpoints?.length ?? 0,
    notes: hydrated.notes
  };
}

export class CreativeRuntime {
  private readonly jobsDir = process.env.ADOBE_MCP_JOBS_DIR ?? join(homedir(), ".adobe-mcp", "jobs");
  private readonly checkpointsDir =
    process.env.ADOBE_MCP_CHECKPOINTS_DIR ?? join(homedir(), ".adobe-mcp", "checkpoints");

  constructor(private readonly broker: LocalBridgeBroker) {}

  private jobPath(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid_job_id");
    return join(this.jobsDir, id + ".json");
  }

  private async save(job: CreativeJob): Promise<void> {
    job.updatedAt = now();
    await mkdir(this.jobsDir, { recursive: true });
    await writeFile(this.jobPath(job.id), JSON.stringify(hydrateJob(job)), "utf8");
  }

  private async load(id: string): Promise<CreativeJob> {
    try {
      return hydrateJob(JSON.parse(await readFile(this.jobPath(id), "utf8")) as CreativeJob);
    } catch {
      throw new Error("creative_job_not_found");
    }
  }

  private async addArtifact(
    job: CreativeJob,
    path: string,
    options: {
      kind: string;
      role: JobArtifact["role"];
      hash?: boolean;
      metadata?: Record<string, unknown>;
    }
  ) {
    const artifact = await inspectArtifact(path, {
      id: randomUUID(),
      kind: options.kind,
      role: options.role,
      revision: job.revision,
      hash: options.hash,
      metadata: options.metadata
    });
    job.artifacts!.push(artifact);
    await this.save(job);
    return artifact;
  }

  private async checkpoint(job: CreativeJob, paths?: string[]) {
    const files = paths?.length ? paths : job.spec.workingFiles;
    if (!files.length) throw new Error("no_working_files_for_checkpoint");
    const checkpoint = await snapshotWorkingFiles(job.id, job.revision, files, this.checkpointsDir);
    job.checkpoints!.push(checkpoint);
    await this.save(job);
    return checkpoint;
  }

  async execute(capability: string, params: Record<string, unknown>, timeoutMs = 120_000): Promise<unknown> {
    if (capability === "creative.runtime.limits") {
      return {
        limits: runtimeLimits(typeof params.host === "string" ? params.host : undefined),
        note: "These are explicit host/tooling ceilings, not silent failures. Prefer the documented fallback and verify outputs."
      };
    }

    if (capability === "creative.repair.plan") {
      if (typeof params.jobId === "string") {
        const job = await this.load(params.jobId);
        const review = job.reviews.at(-1);
        if (!review) throw new Error("job_has_no_review");
        const validation = params.validation && typeof params.validation === "object"
          ? params.validation as { ok?: boolean; issues?: string[]; warnings?: string[] }
          : undefined;
        return planRepairs(job.spec.acceptanceCriteria, review.criteria, review.notes, validation);
      }
      const criteria = Array.isArray(params.criteria) ? params.criteria as any[] : [];
      const reviewCriteria = Array.isArray(params.reviewCriteria) ? params.reviewCriteria as any[] : [];
      return planRepairs(
        criteria,
        reviewCriteria,
        typeof params.notes === "string" ? params.notes : "",
        params.validation && typeof params.validation === "object" ? params.validation as any : undefined
      );
    }

    if (capability === "creative.recipe.list") {
      return { recipes: listRecipes() };
    }

    if (capability === "creative.recipe.expand") {
      if (typeof params.recipeId !== "string") throw new Error("recipeId_required");
      const input = params.input && typeof params.input === "object" && !Array.isArray(params.input)
        ? params.input as Record<string, unknown>
        : {};
      return expandRecipe(params.recipeId, input);
    }

    if (capability === "creative.assets.index") {
      const paths = Array.isArray(params.paths) ? params.paths.filter((x): x is string => typeof x === "string") : [];
      if (!paths.length) throw new Error("paths_required");
      return indexAssets(paths, {
        recursive: params.recursive !== false,
        maxAssets: typeof params.maxAssets === "number" ? params.maxAssets : 500,
        hash: params.hash === true,
        probe: params.probe !== false
      });
    }

    if (capability === "creative.assets.analyze") {
      const paths = Array.isArray(params.paths) ? params.paths.filter((x): x is string => typeof x === "string") : [];
      if (!paths.length) throw new Error("paths_required");
      return analyzeAssets(paths, {
        recursive: params.recursive !== false,
        maxAssets: typeof params.maxAssets === "number" ? params.maxAssets : 500,
        exactHash: params.exactHash === true,
        nearDuplicateDistance: typeof params.nearDuplicateDistance === "number"
          ? params.nearDuplicateDistance
          : undefined
      });
    }

    if (capability === "creative.reference.analyze") {
      if (typeof params.inputPath !== "string" || typeof params.outputDir !== "string") {
        throw new Error("inputPath_and_outputDir_required");
      }
      return analyzeReference(params.inputPath, params.outputDir, {
        sceneThreshold: typeof params.sceneThreshold === "number" ? params.sceneThreshold : undefined,
        silenceDb: typeof params.silenceDb === "number" ? params.silenceDb : undefined,
        silenceMinSeconds: typeof params.silenceMinSeconds === "number" ? params.silenceMinSeconds : undefined,
        maxFrames: typeof params.maxFrames === "number" ? params.maxFrames : undefined,
        proxyWidth: typeof params.proxyWidth === "number" ? params.proxyWidth : undefined
      });
    }

    if (capability === "creative.preview.generate") {
      if (typeof params.inputPath !== "string" || typeof params.outputDir !== "string") {
        throw new Error("inputPath_and_outputDir_required");
      }
      const pack = await generateReviewPack(params.inputPath, params.outputDir, {
        proxyWidth: typeof params.proxyWidth === "number" ? params.proxyWidth : undefined,
        contactFrames: typeof params.contactFrames === "number" ? params.contactFrames : undefined,
        includeWaveform: params.includeWaveform !== false
      });
      if (typeof params.jobId === "string") {
        const job = await this.load(params.jobId);
        for (const artifact of pack.artifacts) {
          await this.addArtifact(job, artifact.path, {
            kind: artifact.kind,
            role: "review",
            metadata: { source: params.inputPath }
          });
        }
      }
      return pack;
    }

    if (capability === "creative.output.validate") {
      if (typeof params.path !== "string") throw new Error("path_required");
      const expected = params.expected && typeof params.expected === "object"
        ? params.expected as Record<string, unknown>
        : {};
      const validation = await validateMediaOutput(params.path, {
        width: typeof expected.width === "number" ? expected.width : undefined,
        height: typeof expected.height === "number" ? expected.height : undefined,
        fps: typeof expected.fps === "number" ? expected.fps : undefined,
        durationSeconds: typeof expected.durationSeconds === "number" ? expected.durationSeconds : undefined,
        durationToleranceSeconds: typeof expected.durationToleranceSeconds === "number" ? expected.durationToleranceSeconds : undefined,
        videoCodec: typeof expected.videoCodec === "string" ? expected.videoCodec : undefined,
        audioRequired: expected.audioRequired === true,
        minSizeBytes: typeof expected.minSizeBytes === "number" ? expected.minSizeBytes : undefined
      });
      if (validation.ok && typeof params.jobId === "string" && params.register !== false) {
        const job = await this.load(params.jobId);
        await this.addArtifact(job, params.path, {
          kind: typeof params.kind === "string" ? params.kind : "media-output",
          role: "deliverable",
          metadata: { validation }
        });
      }
      return validation;
    }

    if (capability === "creative.editspec.validate") {
      return validateEditSpec(params.spec);
    }

    if (capability === "creative.job.create") {
      const spec = editSpecSchema.parse(params.spec);
      const id = randomUUID();
      const timestamp = now();
      const job: CreativeJob = {
        id,
        revision: 1,
        status: "planned",
        createdAt: timestamp,
        updatedAt: timestamp,
        spec,
        operationResults: [],
        reviews: [],
        notes: [],
        artifacts: [],
        checkpoints: []
      };
      await this.save(job);
      return { ok: true, job: compactJob(job) };
    }

    if (capability === "creative.job.get") {
      const id = String(params.jobId ?? "");
      const job = await this.load(id);
      return params.full === true ? job : compactJob(job);
    }

    if (capability === "creative.job.update") {
      const id = String(params.jobId ?? "");
      const job = await this.load(id);
      if (params.spec !== undefined) {
        job.spec = editSpecSchema.parse(params.spec);
        job.revision += 1;
        job.operationResults = [];
        if (job.status !== "completed") job.status = "planned";
      }
      if (typeof params.note === "string" && params.note.trim()) job.notes.push(params.note.trim());
      await this.save(job);
      return { ok: true, job: compactJob(job) };
    }

    if (capability === "creative.job.artifact") {
      const job = await this.load(String(params.jobId ?? ""));
      if (typeof params.path !== "string") throw new Error("path_required");
      const roleValues: JobArtifact["role"][] = ["working", "preview", "review", "deliverable", "reference", "other"];
      const role = roleValues.includes(params.role as JobArtifact["role"])
        ? params.role as JobArtifact["role"]
        : "other";
      const artifact = await this.addArtifact(job, params.path, {
        kind: typeof params.kind === "string" ? params.kind : "file",
        role,
        hash: params.hash !== false,
        metadata: params.metadata && typeof params.metadata === "object"
          ? params.metadata as Record<string, unknown>
          : undefined
      });
      return { ok: true, artifact, job: compactJob(job) };
    }

    if (capability === "creative.job.checkpoint") {
      const job = await this.load(String(params.jobId ?? ""));
      const paths = Array.isArray(params.paths)
        ? params.paths.filter((x): x is string => typeof x === "string")
        : undefined;
      const checkpoint = await this.checkpoint(job, paths);
      return { ok: true, checkpoint, job: compactJob(job) };
    }

    if (capability === "creative.job.restore") {
      if (params.confirm !== true) throw new Error("restore_requires_confirm_true");
      const job = await this.load(String(params.jobId ?? ""));
      const checkpointId = String(params.checkpointId ?? "");
      const checkpoint = job.checkpoints!.find((item) => item.id === checkpointId);
      if (!checkpoint) throw new Error("checkpoint_not_found");
      const requestedPath = typeof params.sourcePath === "string" ? params.sourcePath : undefined;
      const files = requestedPath
        ? checkpoint.files.filter((file) => file.sourcePath === requestedPath)
        : checkpoint.files;
      if (!files.length) throw new Error("checkpoint_file_not_found");
      const backupRoot = join(this.checkpointsDir, job.id, "pre-restore");
      const restored = [];
      for (const file of files) restored.push(await restoreCheckpointFile(file, backupRoot));
      job.notes.push("Restored checkpoint " + checkpoint.id + " at " + now());
      await this.save(job);
      return { ok: true, checkpointId, restored, job: compactJob(job) };
    }

    if (capability === "creative.job.run") {
      const id = String(params.jobId ?? "");
      const job = await this.load(id);
      const stopOnError = params.stopOnError !== false;
      const fromOperationId = typeof params.fromOperationId === "string" ? params.fromOperationId : undefined;
      const resumeUnknown = params.resumeUnknown === true;
      let started = fromOperationId === undefined;

      const unknown = job.operationResults.find((result) => normalizedOperationStatus(result) === "running");
      if (unknown && !resumeUnknown) {
        job.status = "failed";
        job.notes.push(
          "Operation " + unknown.operationId +
          " has an unknown outcome because a previous run stopped before receiving a host result. " +
          "Inspect the host/project and rerun with resumeUnknown=true only when safe."
        );
        await this.save(job);
        return {
          ok: false,
          error: "operation_outcome_unknown",
          unknown: {
            operationId: unknown.operationId,
            capability: unknown.capability,
            startedAt: unknown.startedAt
          },
          job: compactJob(job)
        };
      }

      if (
        params.checkpoint !== false &&
        job.spec.workingFiles.length > 0 &&
        !job.checkpoints!.some((checkpoint) => checkpoint.revision === job.revision)
      ) {
        try {
          await this.checkpoint(job);
        } catch (error) {
          if (params.checkpointRequired !== false) {
            job.status = "failed";
            job.notes.push("Automatic checkpoint failed: " + (error instanceof Error ? error.message : String(error)));
            await this.save(job);
            return { ok: false, error: "automatic_checkpoint_failed", job: compactJob(job) };
          }
        }
      }

      job.status = "executing";
      await this.save(job);

      for (const operation of job.spec.operations) {
        if (!started && operation.id === fromOperationId) started = true;
        if (!started) continue;

        const prior = job.operationResults.find(
          (result) => result.operationId === operation.id && normalizedOperationStatus(result) === "succeeded"
        );
        if (prior && params.rerunSuccessful !== true) continue;

        const staleUnknownIndex = job.operationResults.findIndex(
          (result) => result.operationId === operation.id && normalizedOperationStatus(result) === "running"
        );
        if (staleUnknownIndex >= 0) {
          if (!resumeUnknown) {
            job.status = "failed";
            await this.save(job);
            return { ok: false, error: "operation_outcome_unknown", operationId: operation.id, job: compactJob(job) };
          }
          job.operationResults.splice(staleUnknownIndex, 1);
        }

        const definition = getCapability(operation.capability);
        const running: OperationResult = {
          operationId: operation.id,
          capability: operation.capability,
          status: "running",
          startedAt: now()
        };
        job.operationResults.push(running);
        await this.save(job);

        if (!definition || definition.app === "runtime") {
          running.status = "failed";
          running.ok = false;
          running.error = !definition ? "capability_not_found" : "nested_runtime_operation_not_allowed";
          running.finishedAt = now();
          await this.save(job);
          if (operation.required && stopOnError) {
            job.status = "failed";
            await this.save(job);
            return { ok: false, job: compactJob(job), failed: running };
          }
          continue;
        }

        const bridgeResult = await invokeAdobeCapability(
          this.broker,
          definition.app as AdobeApp,
          operation.capability,
          operation.params,
          timeoutMs
        );
        running.status = bridgeResult.ok ? "succeeded" : "failed";
        running.ok = bridgeResult.ok;
        running.error = bridgeResult.error;
        running.data = bridgeResult.data;
        running.finishedAt = now();
        await this.save(job);

        if (!bridgeResult.ok && operation.required && stopOnError) {
          job.status = "failed";
          await this.save(job);
          return { ok: false, job: compactJob(job), failed: running };
        }
      }

      job.status = job.spec.review.required ? "awaiting_review" : "completed";
      await this.save(job);
      return { ok: true, job: compactJob(job) };
    }

    if (capability === "creative.job.review") {
      const id = String(params.jobId ?? "");
      const job = await this.load(id);
      const verdict = params.verdict === "pass" ? "pass" : "fail";
      const notes = typeof params.notes === "string" ? params.notes : "";
      const criteria = Array.isArray(params.criteria)
        ? params.criteria.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const value = item as Record<string, unknown>;
            if (typeof value.id !== "string") return [];
            return [{
              id: value.id,
              verdict: value.verdict === "pass" ? "pass" as const : "fail" as const,
              note: typeof value.note === "string" ? value.note : undefined
            }];
          })
        : [];
      const artifacts = Array.isArray(params.artifacts)
        ? params.artifacts.filter((x): x is string => typeof x === "string")
        : [];

      if (verdict === "pass") {
        const required = job.spec.acceptanceCriteria.filter((criterion) => criterion.required);
        const passed = new Set(criteria.filter((criterion) => criterion.verdict === "pass").map((criterion) => criterion.id));
        const missing = required.filter((criterion) => !passed.has(criterion.id)).map((criterion) => criterion.id);
        if (missing.length) throw new Error("cannot_pass_review_missing_criteria:" + missing.join(","));
        if (job.spec.review.requireVisualReview && artifacts.length === 0) {
          throw new Error("cannot_pass_review_without_artifacts");
        }
      }

      const review: ReviewRecord = {
        pass: job.reviews.length + 1,
        verdict,
        notes,
        criteria,
        artifacts,
        createdAt: now()
      };
      job.reviews.push(review);
      if (verdict === "pass") {
        job.status = "completed";
      } else if (job.reviews.length >= job.spec.review.maxPasses) {
        job.status = "failed";
        job.notes.push("Maximum review passes reached without acceptance.");
      } else {
        job.status = "needs_repair";
      }
      await this.save(job);
      return { ok: true, job: compactJob(job), review };
    }

    throw new Error("unknown_runtime_capability");
  }
}

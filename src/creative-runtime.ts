import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { indexAssets } from "./assets.js";
import { getCapability } from "./catalog.js";
import { editSpecSchema, validateEditSpec, type EditSpec } from "./creative-spec.js";
import type { LocalBridgeBroker } from "./broker.js";
import type { AdobeApp } from "./types.js";

type JobStatus = "planned" | "executing" | "awaiting_review" | "needs_repair" | "completed" | "failed";

interface OperationResult {
  operationId: string;
  capability: string;
  ok: boolean;
  error?: string;
  data?: unknown;
  startedAt: string;
  finishedAt: string;
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
}

function now(): string {
  return new Date().toISOString();
}

function compactJob(job: CreativeJob) {
  return {
    id: job.id,
    revision: job.revision,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    title: job.spec.title,
    deliverables: job.spec.deliverables,
    operationCount: job.spec.operations.length,
    completedOperations: job.operationResults.filter((r) => r.ok).length,
    failedOperations: job.operationResults.filter((r) => !r.ok).length,
    reviewPasses: job.reviews.length,
    lastReview: job.reviews.at(-1),
    notes: job.notes
  };
}

export class CreativeRuntime {
  private readonly jobsDir = process.env.ADOBE_MCP_JOBS_DIR ?? join(homedir(), ".adobe-mcp", "jobs");

  constructor(private readonly broker: LocalBridgeBroker) {}

  private jobPath(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("invalid_job_id");
    return join(this.jobsDir, id + ".json");
  }

  private async save(job: CreativeJob): Promise<void> {
    job.updatedAt = now();
    await mkdir(this.jobsDir, { recursive: true });
    await writeFile(this.jobPath(job.id), JSON.stringify(job), "utf8");
  }

  private async load(id: string): Promise<CreativeJob> {
    try {
      return JSON.parse(await readFile(this.jobPath(id), "utf8")) as CreativeJob;
    } catch {
      throw new Error("creative_job_not_found");
    }
  }

  async execute(capability: string, params: Record<string, unknown>, timeoutMs = 120_000): Promise<unknown> {
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
        notes: []
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

    if (capability === "creative.job.run") {
      const id = String(params.jobId ?? "");
      const job = await this.load(id);
      const stopOnError = params.stopOnError !== false;
      const fromOperationId = typeof params.fromOperationId === "string" ? params.fromOperationId : undefined;
      let started = fromOperationId === undefined;

      job.status = "executing";
      await this.save(job);

      for (const operation of job.spec.operations) {
        if (!started && operation.id === fromOperationId) started = true;
        if (!started) continue;

        const prior = job.operationResults.find((r) => r.operationId === operation.id && r.ok);
        if (prior && params.rerunSuccessful !== true) continue;

        const definition = getCapability(operation.capability);
        const startedAt = now();

        if (!definition) {
          const result: OperationResult = {
            operationId: operation.id,
            capability: operation.capability,
            ok: false,
            error: "capability_not_found",
            startedAt,
            finishedAt: now()
          };
          job.operationResults.push(result);
          if (operation.required && stopOnError) {
            job.status = "failed";
            await this.save(job);
            return { ok: false, job: compactJob(job), failed: result };
          }
          continue;
        }

        if (definition.app === "runtime") {
          const result: OperationResult = {
            operationId: operation.id,
            capability: operation.capability,
            ok: false,
            error: "nested_runtime_operation_not_allowed",
            startedAt,
            finishedAt: now()
          };
          job.operationResults.push(result);
          if (operation.required && stopOnError) {
            job.status = "failed";
            await this.save(job);
            return { ok: false, job: compactJob(job), failed: result };
          }
          continue;
        }

        const bridgeResult = await this.broker.invoke(
          definition.app as AdobeApp,
          operation.capability,
          operation.params,
          timeoutMs
        );
        const result: OperationResult = {
          operationId: operation.id,
          capability: operation.capability,
          ok: bridgeResult.ok,
          error: bridgeResult.error,
          data: bridgeResult.data,
          startedAt,
          finishedAt: now()
        };
        job.operationResults.push(result);
        await this.save(job);

        if (!bridgeResult.ok && operation.required && stopOnError) {
          job.status = "failed";
          await this.save(job);
          return { ok: false, job: compactJob(job), failed: result };
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

      const review: ReviewRecord = {
        pass: job.reviews.length + 1,
        verdict,
        notes,
        criteria,
        artifacts,
        createdAt: now()
      };
      job.reviews.push(review);
      job.status = verdict === "pass" ? "completed" : "needs_repair";
      await this.save(job);
      return { ok: true, job: compactJob(job), review };
    }

    throw new Error("unknown_runtime_capability");
  }
}

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

export interface JobCheckpointFile {
  sourcePath: string;
  snapshotPath: string;
  sizeBytes: number;
  sha256: string;
}

export interface JobCheckpoint {
  id: string;
  revision: number;
  createdAt: string;
  files: JobCheckpointFile[];
}

export interface JobArtifact {
  id: string;
  kind: string;
  role: "working" | "preview" | "review" | "deliverable" | "reference" | "other";
  path: string;
  sizeBytes?: number;
  sha256?: string;
  revision: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export async function hashFile(path: string): Promise<string> {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function safeName(index: number, path: string): string {
  const base = basename(path).replace(/[^A-Za-z0-9._-]+/g, "_") || "file";
  return String(index + 1).padStart(3, "0") + "-" + base;
}

export async function snapshotWorkingFiles(
  jobId: string,
  revision: number,
  paths: string[],
  root: string
): Promise<JobCheckpoint> {
  const unique = [...new Set(paths.map((path) => resolve(path)))];
  const checkpointId = "r" + revision + "-" + Date.now();
  const folder = join(root, jobId, checkpointId);
  await mkdir(folder, { recursive: true });
  const files: JobCheckpointFile[] = [];

  for (let index = 0; index < unique.length; index++) {
    const sourcePath = unique[index];
    const info = await stat(sourcePath);
    if (!info.isFile()) throw new Error("checkpoint_source_not_file:" + sourcePath);
    const snapshotPath = join(folder, safeName(index, sourcePath));
    await copyFile(sourcePath, snapshotPath);
    files.push({
      sourcePath,
      snapshotPath,
      sizeBytes: info.size,
      sha256: await hashFile(snapshotPath)
    });
  }

  return {
    id: checkpointId,
    revision,
    createdAt: new Date().toISOString(),
    files
  };
}

export async function restoreCheckpointFile(
  checkpointFile: JobCheckpointFile,
  backupRoot: string
) {
  const target = resolve(checkpointFile.sourcePath);
  const current = await stat(target).catch(() => null);
  let backupPath: string | undefined;

  if (current?.isFile()) {
    await mkdir(backupRoot, { recursive: true });
    backupPath = join(backupRoot, Date.now() + "-" + basename(target));
    await copyFile(target, backupPath);
  } else {
    await mkdir(dirname(target), { recursive: true });
  }

  await copyFile(checkpointFile.snapshotPath, target);
  return {
    restored: target,
    backupPath,
    sha256: await hashFile(target)
  };
}

export async function inspectArtifact(
  path: string,
  input: {
    id: string;
    kind: string;
    role: JobArtifact["role"];
    revision: number;
    hash?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<JobArtifact> {
  const absolute = resolve(path);
  const info = await stat(absolute);
  if (!info.isFile()) throw new Error("artifact_not_file:" + absolute);
  return {
    id: input.id,
    kind: input.kind,
    role: input.role,
    path: absolute,
    sizeBytes: info.size,
    sha256: input.hash === false ? undefined : await hashFile(absolute),
    revision: input.revision,
    createdAt: new Date().toISOString(),
    metadata: input.metadata
  };
}

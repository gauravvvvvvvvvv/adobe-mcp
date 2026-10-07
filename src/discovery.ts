import { access, readdir, stat } from "node:fs/promises";
import { basename, delimiter, join, resolve } from "node:path";
import { homedir, platform } from "node:os";

export interface DiscoveredInstall {
  path: string;
  name: string;
}

const ADOBE_APP_NAME = /adobe|photoshop|illustrator|premiere|after effects|audition|media encoder|indesign|animate|lightroom|acrobat|bridge|substance/i;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function splitEnvPaths(name: string): string[] {
  return (process.env[name] ?? "")
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => resolve(value));
}

function roots(): string[] {
  const extra = splitEnvPaths("ADOBE_MCP_APP_DIRS");
  if (platform() === "win32") {
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    const localPrograms = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs") : "";
    return [
      programFiles ? join(programFiles, "Adobe") : "",
      programFiles ?? "",
      programFilesX86 ? join(programFilesX86, "Adobe") : "",
      programFilesX86 ?? "",
      localPrograms,
      ...extra
    ].filter(Boolean);
  }
  if (platform() === "darwin") {
    return ["/Applications", join(homedir(), "Applications"), ...extra];
  }
  return extra;
}

function explicitPaths(): string[] {
  return splitEnvPaths("ADOBE_MCP_APP_PATHS");
}

function pushUnique(result: DiscoveredInstall[], seen: Set<string>, path: string, name?: string) {
  const normalized = resolve(path);
  const key = process.platform === "win32" ? normalized.toLowerCase() : normalized;
  if (seen.has(key)) return;
  seen.add(key);
  result.push({ name: name || basename(normalized), path: normalized });
}

export async function discoverAdobeInstalls(): Promise<DiscoveredInstall[]> {
  const result: DiscoveredInstall[] = [];
  const seen = new Set<string>();

  for (const path of explicitPaths()) {
    try {
      const info = await stat(path);
      if (info.isDirectory() || info.isFile()) pushUnique(result, seen, path);
    } catch {
      // Explicit paths are best-effort so a stale path never blocks MCP startup.
    }
  }

  for (const root of roots()) {
    if (!(await exists(root))) continue;

    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        if (!ADOBE_APP_NAME.test(name)) continue;
        pushUnique(result, seen, join(root, name), name);
      }
    } catch {
      // An unreadable install root should not stop MCP startup.
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
}

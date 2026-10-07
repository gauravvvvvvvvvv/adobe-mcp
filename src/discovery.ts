import { access, readdir } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { homedir, platform } from "node:os";

export interface DiscoveredInstall {
  path: string;
  name: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function roots(): string[] {
  const extra = (process.env.ADOBE_MCP_APP_DIRS ?? "").split(delimiter).filter(Boolean);
  if (platform() === "win32") {
    return [
      process.env.ProgramFiles ? join(process.env.ProgramFiles, "Adobe") : "",
      process.env["ProgramFiles(x86)"] ? join(process.env["ProgramFiles(x86)"]!, "Adobe") : "",
      ...extra
    ].filter(Boolean);
  }
  if (platform() === "darwin") return ["/Applications", join(homedir(), "Applications"), ...extra];
  return extra;
}

export async function discoverAdobeInstalls(): Promise<DiscoveredInstall[]> {
  const result: DiscoveredInstall[] = [];

  for (const root of roots()) {
    if (!(await exists(root))) continue;

    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const name = entry.name;
        if (
          platform() === "darwin" &&
          !/adobe|photoshop|illustrator|premiere|after effects|audition|media encoder|indesign|animate|lightroom|acrobat|bridge|substance/i.test(name)
        ) continue;
        result.push({ name, path: join(root, name) });
      }
    } catch {
      // An unreadable install root should not stop MCP startup.
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

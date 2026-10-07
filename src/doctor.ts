import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { discoverAdobeInstalls } from "./discovery.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const port = Number.parseInt(process.env.ADOBE_MCP_BRIDGE_PORT ?? "38470", 10);
const documentsDir = process.env.ADOBE_MCP_DOCUMENTS_DIR ?? join(homedir(), "Documents");

function commandInfo(command: string, args: string[] = ["-version"]) {
  try {
    const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, firstLine: output.split(/\r?\n/)[0]?.trim() ?? "" };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string };
    const text = String(err.stdout || err.stderr || err.message || "").split(/\r?\n/)[0]?.trim();
    return { ok: false, error: text || "not_found" };
  }
}

async function exists(path: string | null | undefined) {
  if (!path) return false;
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function bridgeHealth(): Promise<Record<string, unknown>> {
  return new Promise((resolveHealth) => {
    const request = http.get({
      hostname: "127.0.0.1",
      port,
      path: "/health",
      timeout: 800
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolveHealth({ reachable: true, statusCode: response.statusCode, body: JSON.parse(body) });
        } catch {
          resolveHealth({ reachable: true, statusCode: response.statusCode, body: body.slice(0, 1000) });
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => resolveHealth({ reachable: false, error: error.message }));
  });
}

function platformPaths() {
  const appData = process.env.APPDATA;
  if (process.platform === "win32") {
    return {
      cep: appData ? join(appData, "Adobe", "CEP", "extensions", "com.gaurav.adobe-mcp") : null,
      lightroom: appData ? join(appData, "Adobe", "Lightroom", "Modules", "AdobeMCP.lrplugin") : null,
      acrobat: appData ? join(appData, "Adobe", "Acrobat", "DC", "JavaScripts", "AdobeMCP.js") : null,
      substance: join(documentsDir, "Adobe", "Adobe Substance 3D Painter", "python", "startup", "adobe_mcp.py")
    };
  }
  if (process.platform === "darwin") {
    return {
      cep: join(homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions", "com.gaurav.adobe-mcp"),
      lightroom: join(homedir(), "Library", "Application Support", "Adobe", "Lightroom", "Modules", "AdobeMCP.lrplugin"),
      acrobat: join(homedir(), "Library", "Application Support", "Adobe", "Acrobat", "DC", "JavaScripts", "AdobeMCP.js"),
      substance: join(documentsDir, "Adobe", "Adobe Substance 3D Painter", "python", "startup", "adobe_mcp.py")
    };
  }
  return {
    cep: join(homedir(), ".adobe", "cep", "extensions", "com.gaurav.adobe-mcp"),
    lightroom: null,
    acrobat: null,
    substance: join(documentsDir, "Adobe", "Adobe Substance 3D Painter", "python", "startup", "adobe_mcp.py")
  };
}

function uxpDeveloperSettings() {
  if (process.platform === "win32") {
    const common = process.env.CommonProgramFiles ?? process.env["CommonProgramFiles(x86)"];
    return common ? join(common, "Adobe", "UXP", "Developer", "settings.json") : null;
  }
  if (process.platform === "darwin") return "/Library/Application Support/Adobe/UXP/Developer/settings.json";
  return null;
}

async function parseDeveloperMode(path: string | null) {
  if (!path) return { path: null, exists: false, developer: false };
  if (!(await exists(path))) return { path, exists: false, developer: false };
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return { path, exists: true, developer: parsed?.developer === true };
  } catch (error) {
    return { path, exists: true, developer: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
const installs = await discoverAdobeInstalls();
const ffmpeg = commandInfo("ffmpeg");
const ffprobe = commandInfo("ffprobe");
const paths = platformPaths();
const developerMode = await parseDeveloperMode(uxpDeveloperSettings());
const bridge = await bridgeHealth();

const sources = {
  cep: join(repoRoot, "adapters", "cep-universal", "CSXS", "manifest.xml"),
  photoshopUxp: join(repoRoot, "adapters", "photoshop-uxp", "manifest.json"),
  mediaEncoderUxp: join(repoRoot, "adapters", "media-encoder-uxp", "manifest.json"),
  lightroom: join(repoRoot, "adapters", "lightroom-classic", "AdobeMCP.lrplugin", "Info.lua"),
  acrobat: join(repoRoot, "adapters", "acrobat", "AdobeMCP.js"),
  substancePainter: join(repoRoot, "adapters", "substance-3d-painter", "python", "startup", "adobe_mcp.py")
};

const sourceAdapters = {
  cep: { ok: await exists(sources.cep), path: sources.cep },
  photoshopUxp: { ok: await exists(sources.photoshopUxp), path: sources.photoshopUxp },
  mediaEncoderUxp: { ok: await exists(sources.mediaEncoderUxp), path: sources.mediaEncoderUxp },
  lightroom: { ok: await exists(sources.lightroom), path: sources.lightroom },
  acrobat: { ok: await exists(sources.acrobat), path: sources.acrobat },
  substancePainter: { ok: await exists(sources.substancePainter), path: sources.substancePainter }
};

const installedAdapters = {
  cep: { installed: await exists(paths.cep), path: paths.cep },
  lightroom: { installed: await exists(paths.lightroom), path: paths.lightroom },
  acrobat: { installed: await exists(paths.acrobat), path: paths.acrobat },
  substancePainter: { installed: await exists(paths.substance), path: paths.substance },
  uxpDeveloperMode: developerMode,
  photoshopUxp: {
    sourceReady: sourceAdapters.photoshopUxp.ok,
    installMode: "Load adapters/photoshop-uxp/manifest.json in UXP Developer Tool or install an Adobe-generated .ccx package."
  },
  mediaEncoderUxp: {
    sourceReady: sourceAdapters.mediaEncoderUxp.ok,
    installMode: "Load adapters/media-encoder-uxp/manifest.json in UXP Developer Tool for Media Encoder 27+."
  }
};

const connectedApps = (() => {
  const body = (bridge as { body?: { apps?: Array<{ app?: string; connected?: boolean }> } }).body;
  return Array.isArray(body?.apps)
    ? body!.apps!.filter((entry) => entry?.connected).map((entry) => entry.app).filter((app): app is string => typeof app === "string")
    : [];
})();

const checks = {
  node: {
    ok: Number.isFinite(nodeMajor) && nodeMajor >= 20,
    version: process.version,
    required: ">=20"
  },
  ffmpeg,
  ffprobe,
  sourceAdapters,
  installedAdapters,
  bridge: {
    port,
    ...bridge,
    connectedApps
  },
  discoveredInstalls: installs
};

const hardFailures: string[] = [];
if (!checks.node.ok) hardFailures.push("node>=20");
for (const [name, value] of Object.entries(sourceAdapters)) {
  if (!value.ok) hardFailures.push(name + "_adapter_source");
}

const warnings: string[] = [];
if (!ffmpeg.ok) warnings.push("ffmpeg_missing");
if (!ffprobe.ok) warnings.push("ffprobe_missing");
if (!(bridge as { reachable?: boolean }).reachable) warnings.push("bridge_not_running");
if (!installedAdapters.cep.installed) warnings.push("cep_adapter_not_installed");
if (!installedAdapters.lightroom.installed) warnings.push("lightroom_adapter_not_installed");
if (!installedAdapters.acrobat.installed) warnings.push("acrobat_adapter_not_installed");
if (!installedAdapters.substancePainter.installed) warnings.push("substance_painter_adapter_not_installed");
if (!developerMode.developer) warnings.push("uxp_developer_mode_not_confirmed");

const installCommand =
  process.platform === "win32" ? "npm run install:windows" :
  process.platform === "darwin" ? "npm run install:macos" :
  "Install host adapters manually using docs/INSTALL.md.";

const report = {
  ok: hardFailures.length === 0,
  readyForCreativeVideo: hardFailures.length === 0 && ffmpeg.ok && ffprobe.ok,
  readyForCoreHostAutomation: hardFailures.length === 0 && installedAdapters.cep.installed,
  platform: process.platform,
  architecture: process.arch,
  repoRoot,
  documentsDir,
  checks,
  hardFailures,
  warnings,
  nextSteps: [
    !ffmpeg.ok || !ffprobe.ok ? "Install ffmpeg/ffprobe and ensure both commands are on PATH." : null,
    !installedAdapters.cep.installed || !installedAdapters.lightroom.installed || !installedAdapters.acrobat.installed || !installedAdapters.substancePainter.installed
      ? installCommand
      : null,
    !developerMode.developer
      ? "Enable UXP Developer Mode, then load the Photoshop and Media Encoder manifests in Adobe UXP Developer Tool (or install Adobe-generated .ccx packages where supported)."
      : null,
    !(bridge as { reachable?: boolean }).reachable ? "Start adobe-mcp (or npm run dev), then reopen/check the desired Adobe host." : null,
    (bridge as { reachable?: boolean }).reachable && connectedApps.length === 0
      ? "The broker is running but no Adobe host adapter is connected yet. Open a configured Adobe application."
      : null
  ].filter(Boolean),
  notes: [
    "CEP covers Premiere Pro, After Effects, Illustrator, InDesign, Animate, Audition and Bridge.",
    "Photoshop and Media Encoder use UXP adapters.",
    "Lightroom Classic uses a Lua plugin; Acrobat Pro uses a trusted folder-level JavaScript; Substance 3D Painter uses a Python startup plugin.",
    "Discovery only reports local installations. Adobe MCP never bypasses licensing or activation."
  ]
};

console.log(JSON.stringify(report, null, 2));
if (hardFailures.length) process.exitCode = 1;

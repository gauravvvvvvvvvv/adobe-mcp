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

async function exists(path: string) {
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

function cepInstallPath() {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    return appData ? join(appData, "Adobe", "CEP", "extensions", "com.gaurav.adobe-mcp") : null;
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Adobe", "CEP", "extensions", "com.gaurav.adobe-mcp");
  }
  return join(homedir(), ".adobe", "cep", "extensions", "com.gaurav.adobe-mcp");
}

function uxpDeveloperSettings() {
  if (process.platform === "win32") {
    const common = process.env.CommonProgramFiles ?? process.env["CommonProgramFiles(x86)"];
    return common ? join(common, "Adobe", "UXP", "Developer", "settings.json") : null;
  }
  if (process.platform === "darwin") {
    return "/Library/Application Support/Adobe/UXP/Developer/settings.json";
  }
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
const cepSource = join(repoRoot, "adapters", "cep-universal", "CSXS", "manifest.xml");
const photoshopSource = join(repoRoot, "adapters", "photoshop-uxp", "manifest.json");
const cepTarget = cepInstallPath();
const developerMode = await parseDeveloperMode(uxpDeveloperSettings());
const bridge = await bridgeHealth();

const checks = {
  node: {
    ok: Number.isFinite(nodeMajor) && nodeMajor >= 20,
    version: process.version,
    required: ">=20"
  },
  ffmpeg,
  ffprobe,
  sourceAdapters: {
    cep: { ok: await exists(cepSource), path: cepSource },
    photoshopUxp: { ok: await exists(photoshopSource), path: photoshopSource }
  },
  installedAdapters: {
    cep: cepTarget ? { installed: await exists(cepTarget), path: cepTarget } : { installed: false, path: null },
    photoshopDeveloperMode: developerMode
  },
  bridge: {
    port,
    ...bridge
  },
  discoveredInstalls: installs
};

const hardFailures: string[] = [];
if (!checks.node.ok) hardFailures.push("node>=20");
if (!checks.sourceAdapters.cep.ok) hardFailures.push("cep_adapter_source");
if (!checks.sourceAdapters.photoshopUxp.ok) hardFailures.push("photoshop_uxp_adapter_source");

const creativeVideoWarnings: string[] = [];
if (!ffmpeg.ok) creativeVideoWarnings.push("ffmpeg_missing");
if (!ffprobe.ok) creativeVideoWarnings.push("ffprobe_missing");
if (!bridge.reachable) creativeVideoWarnings.push("bridge_not_running");
if (!checks.installedAdapters.cep.installed) creativeVideoWarnings.push("cep_adapter_not_installed");
if (!developerMode.developer) creativeVideoWarnings.push("photoshop_uxp_developer_mode_not_confirmed");

const report = {
  ok: hardFailures.length === 0,
  readyForCreativeVideo: hardFailures.length === 0 && ffmpeg.ok && ffprobe.ok,
  platform: process.platform,
  architecture: process.arch,
  repoRoot,
  checks,
  hardFailures,
  warnings: creativeVideoWarnings,
  nextSteps: [
    !ffmpeg.ok || !ffprobe.ok ? "Install ffmpeg/ffprobe and ensure both are on PATH." : null,
    !checks.installedAdapters.cep.installed
      ? (process.platform === "win32" ? "Run npm run install:windows." : process.platform === "darwin" ? "Run npm run install:macos." : "Install the CEP adapter manually.")
      : null,
    !developerMode.developer ? "For Photoshop development loading, enable UXP Developer Mode and load adapters/photoshop-uxp/manifest.json in UXP Developer Tool." : null,
    !bridge.reachable ? "Start adobe-mcp (or npm run dev) before opening/using an Adobe host." : null
  ].filter(Boolean),
  note: "Discovery only reports local installations. Adobe MCP never bypasses licensing or activation."
};

console.log(JSON.stringify(report, null, 2));
if (hardFailures.length) process.exitCode = 1;

import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITIES } from "./catalog.js";
import { auditCapabilitySources } from "./capability-coverage.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

async function json(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
}

const errors: string[] = [];
const warnings: string[] = [];
const checks: Record<string, unknown> = {};

const packageJson = await json(join(root, "package.json"));

const tsconfig = await json(join(root, "tsconfig.json"));
if (!Array.isArray(tsconfig.compilerOptions?.types) || !tsconfig.compilerOptions.types.includes("node")) {
  errors.push("typescript_node_types_missing");
}
checks.typescript = { nodeTypes: tsconfig.compilerOptions?.types ?? [] };

checks.package = {
  name: packageJson.name,
  version: packageJson.version,
  prepack: packageJson.scripts?.prepack,
  noCiByContract: true
};
if (packageJson.scripts?.prepack !== "npm run check && npm run release:check") errors.push("package.prepack_must_run_check_and_release_check");

const requiredFiles = [
  "src/index.ts",
  "src/broker.ts",
  "src/creative-runtime.ts",
  "src/capability-guides.ts",
  "src/capability-coverage.ts",
  "src/version.ts",
  "src/asset-analysis.ts",
  "src/limits.ts",
  "src/acceptance-runner.ts",
  "adapters/cep-universal/CSXS/manifest.xml",
  "adapters/photoshop-uxp/manifest.json",
  "adapters/photoshop-uxp/main.js",
  "adapters/media-encoder-uxp/manifest.json",
  "adapters/media-encoder-uxp/main.js",
  "adapters/lightroom-classic/AdobeMCP.lrplugin/Info.lua",
  "adapters/lightroom-classic/AdobeMCP.lrplugin/Init.lua",
  "adapters/acrobat/AdobeMCP.js",
  "adapters/substance-3d-painter/python/startup/adobe_mcp.py",
  "docs/TASKS.md",
  "docs/HANDOVER.md",
  "docs/AGENT-PLAYBOOK.md",
  "docs/ACCEPTANCE.md"
];
const missing: string[] = [];
for (const relative of requiredFiles) if (!(await exists(join(root, relative)))) missing.push(relative);
checks.requiredFiles = { total: requiredFiles.length, missing };
if (missing.length) errors.push("required_files_missing");

const entrySource = await readFile(join(root, "src", "index.ts"), "utf8");
checks.mcpStdioFactory = {
  usesFactory: /serveStdio\(buildServer\)/.test(entrySource),
  closesBrokerOnServerClose: /server\.server\.onclose/.test(entrySource)
};
if (!(checks.mcpStdioFactory as { usesFactory?: boolean }).usesFactory) errors.push("mcp_stdio_factory_missing");
if (!(checks.mcpStdioFactory as { closesBrokerOnServerClose?: boolean }).closesBrokerOnServerClose) errors.push("mcp_stdio_cleanup_missing");

const capabilityCoverage = await auditCapabilitySources(root, CAPABILITIES);
checks.capabilityCoverage = capabilityCoverage;
if (!capabilityCoverage.ok) errors.push("catalog_capability_without_implementation");

async function validateUxp(relative: string, expectedHost: string) {
  const path = join(root, relative);
  const manifest = await json(path);
  const result = {
    id: manifest.id,
    version: manifest.version,
    manifestVersion: manifest.manifestVersion,
    host: manifest.host,
    fullAccess: manifest.requiredPermissions?.localFileSystem,
    localBrokerDomains: manifest.requiredPermissions?.network?.domains,
    main: manifest.main,
    mainExists: typeof manifest.main === "string" ? await exists(join(dirname(path), manifest.main)) : false
  };
  if (manifest.manifestVersion !== 5) errors.push(relative + ":manifestVersion");
  if (!manifest.id || typeof manifest.id !== "string") errors.push(relative + ":id");
  if (Array.isArray(manifest.host) || manifest.host?.app?.toLowerCase() !== expectedHost.toLowerCase()) {
    errors.push(relative + ":single_host_required");
  }
  if (manifest.requiredPermissions?.localFileSystem !== "fullAccess") errors.push(relative + ":fullAccess_required");
  const domains = manifest.requiredPermissions?.network?.domains ?? [];
  if (!domains.includes("ws://127.0.0.1:38470")) errors.push(relative + ":broker_domain_missing");
  if (!result.mainExists) errors.push(relative + ":main_missing");
  if (manifest.version !== packageJson.version) warnings.push(relative + ":version_differs_from_package");
  return result;
}

checks.photoshopUxp = await validateUxp("adapters/photoshop-uxp/manifest.json", "PS");
checks.mediaEncoderUxp = await validateUxp("adapters/media-encoder-uxp/manifest.json", "ame");

const versionSource = await readFile(join(root, "src", "version.ts"), "utf8");
const versionMatch = /ADOBE_MCP_VERSION\s*=\s*"([^"]+)"/.exec(versionSource);
checks.versionConsistency = {
  package: packageJson.version,
  runtime: versionMatch?.[1] ?? null,
  photoshop: (checks.photoshopUxp as { version?: string }).version,
  mediaEncoder: (checks.mediaEncoderUxp as { version?: string }).version
};
if (!versionMatch || versionMatch[1] !== packageJson.version) errors.push("runtime_version_mismatch");
if ((checks.photoshopUxp as { version?: string }).version !== packageJson.version) errors.push("photoshop_manifest_version_mismatch");
if ((checks.mediaEncoderUxp as { version?: string }).version !== packageJson.version) errors.push("media_encoder_manifest_version_mismatch");

const githubDir = join(root, ".github");
if (await exists(githubDir)) {
  const entries = await readdir(githubDir).catch(() => []);
  if (entries.includes("workflows")) errors.push("github_actions_forbidden");
}
checks.noGitHubActions = !errors.includes("github_actions_forbidden");

const tasksText = await readFile(join(root, "docs", "TASKS.md"), "utf8");
const partials = tasksText.split(/\r?\n/).filter((line) => line.startsWith("- [~]"));
const allowedExternalPartialFragments = [
  "actual workstation run",
  "actual vision-guided repair acceptance",
  "UXP Developer Tool",
  "packaged/manual CCX"
];
const unexpectedPartials = partials.filter(
  (line) => !allowedExternalPartialFragments.some((fragment) => line.includes(fragment))
);
checks.taskChecklist = {
  partialCount: partials.length,
  partials,
  unexpectedPartials
};
if (unexpectedPartials.length) errors.push("unexpected_implementation_partials");

const externalGates = [
  {
    id: "real-host-premiere-acceptance",
    command: "npm run accept:premiere -- --scenario <scenario.json>",
    reason: "Requires the target workstation, installed Premiere/AME and real project/media."
  },
  {
    id: "vision-guided-repair-acceptance",
    command: "Inspect the generated review pack and submit creative.job.review; repair and rerun when a required criterion fails.",
    reason: "Creative-quality acceptance requires a vision-capable agent/human to inspect the rendered output."
  },
  {
    id: "uxp-ccx-packaging",
    command: "Use Adobe UXP Developer Tool > Add Plugin > Package for each UXP host adapter.",
    reason: "Adobe-supported .ccx generation is an external desktop-tool workflow."
  }
];

const report = {
  ok: errors.length === 0,
  codeReady: errors.length === 0 && unexpectedPartials.length === 0,
  packageVersion: packageJson.version,
  errors,
  warnings,
  checks,
  externalGates,
  releaseSequence: [
    "npm install",
    "npm run check",
    "npm run release:check",
    "npm run doctor",
    "complete real-host acceptance",
    "package/test UXP .ccx files with Adobe UXP Developer Tool",
    "npm pack (prepack runs npm run check && npm run release:check)"
  ]
};

console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;

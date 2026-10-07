import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Capability, CapabilityTarget } from "./types.js";

export const CAPABILITY_SOURCE_PATHS: Record<CapabilityTarget, string[]> = {
  runtime: ["src/creative-runtime.ts"],
  premiere: ["src/compilers/premiere.ts", "adapters/cep-universal/main.js"],
  "after-effects": ["src/compilers/after-effects.ts", "adapters/cep-universal/main.js"],
  photoshop: ["adapters/photoshop-uxp/main.js"],
  illustrator: ["src/compilers/illustrator.ts", "adapters/cep-universal/main.js"],
  audition: ["src/compilers/audition.ts", "adapters/cep-universal/main.js"],
  "media-encoder": ["adapters/media-encoder-uxp/main.js"],
  indesign: ["src/compilers/indesign.ts"],
  animate: ["src/compilers/animate.ts"],
  "lightroom-classic": ["adapters/lightroom-classic/AdobeMCP.lrplugin/Init.lua"],
  acrobat: ["adapters/acrobat/AdobeMCP.js"],
  bridge: ["src/compilers/bridge.ts"],
  "substance-3d": ["adapters/substance-3d-painter/python/startup/adobe_mcp.py"]
};

export async function auditCapabilitySources(root: string, capabilities: Capability[]) {
  const cache = new Map<string, string>();
  const missing: Array<{ id: string; app: CapabilityTarget; sources: string[] }> = [];
  const duplicateIds = capabilities
    .map((capability) => capability.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);

  for (const capability of capabilities) {
    const sources = CAPABILITY_SOURCE_PATHS[capability.app] ?? [];
    let implemented = false;
    for (const relative of sources) {
      let source = cache.get(relative);
      if (source === undefined) {
        try { source = await readFile(join(root, relative), "utf8"); }
        catch { source = ""; }
        cache.set(relative, source);
      }
      if (source.includes(capability.id)) {
        implemented = true;
        break;
      }
    }
    if (!implemented) missing.push({ id: capability.id, app: capability.app, sources });
  }

  return {
    ok: missing.length === 0 && duplicateIds.length === 0,
    catalogCount: capabilities.length,
    duplicateIds: [...new Set(duplicateIds)],
    missing
  };
}

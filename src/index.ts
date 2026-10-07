#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { LocalBridgeBroker } from "./broker.js";
import { getCapability, searchCapabilities } from "./catalog.js";
import { getCapabilityGuide } from "./capability-guides.js";
import { CreativeRuntime } from "./creative-runtime.js";
import { discoverAdobeInstalls } from "./discovery.js";
import { invokeAdobeCapability } from "./invoke.js";
import { ADOBE_APPS, type AdobeApp } from "./types.js";
import { ADOBE_MCP_VERSION } from "./version.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function compactForModel(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value.length <= 500 ? value : value.slice(0, 500) + "…";
  if (depth >= 3) {
    if (Array.isArray(value)) return { count: value.length, truncated: true };
    if (typeof value === "object") return { keys: Object.keys(value as Record<string, unknown>).slice(0, 20), truncated: true };
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length <= 8) return value.map((item) => compactForModel(item, depth + 1));
    return {
      count: value.length,
      items: value.slice(0, 5).map((item) => compactForModel(item, depth + 1)),
      truncated: true
    };
  }
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const priority = [
      "id","jobId","operationId","operation","status","success","ok","error",
      "name","path","outputPath","sequence","effect","count","requested","reviewed",
      "truncated","cacheHits","warnings","issues","artifacts","result","writes"
    ];
    const keys = [...priority.filter((key) => key in source), ...Object.keys(source).filter((key) => !priority.includes(key))];
    const output: Record<string, unknown> = {};
    for (const key of keys.slice(0, 18)) {
      if (key === "script" || key === "descriptors" || key === "raw") continue;
      output[key] = compactForModel(source[key], depth + 1);
    }
    if (Object.keys(source).length > Object.keys(output).length) output._truncatedKeys = true;
    return output;
  }
  return String(value);
}

function formatBatchResult(
  capability: string,
  result: { ok?: boolean; error?: unknown; data?: unknown } & Record<string, unknown>,
  mode: "compact" | "full" | "none"
) {
  if (mode === "full") return { capability, ...result };
  const base: Record<string, unknown> = { capability, ok: result.ok !== false };
  if (result.error !== undefined) base.error = result.error;
  if (mode === "compact" && result.data !== undefined) base.data = compactForModel(result.data);
  return base;
}

const broker = new LocalBridgeBroker();
await broker.start();
const runtime = new CreativeRuntime(broker);

function buildServer() {
const server = new McpServer(
  { name: "adobe-mcp", version: ADOBE_MCP_VERSION },
  {
    instructions:
      "Adobe MCP is a local creative-agent runtime. For one-prompt work, analyze/fingerprint sources, use creative.assets.review for shortlisted visuals and creative.audio.analyze for rhythm when useful, then create/run one persistent EditSpec job. Use get_capability instead of guessing call shapes and creative.runtime.limits for host/API ceilings. Keep batch_execute in compact result mode unless full host payloads are needed. Inspect rendered/review artifacts before passing creative.job.review. Reuse inspect_context.contextHash as knownHash. Host adapters reconnect without restarting MCP."
  }
);

const appSchema = z.enum(ADOBE_APPS);

async function invokeCapability(capability: string, params: Record<string, unknown>, timeoutMs: number) {
  const spec = getCapability(capability);
  if (!spec) return { ok: false, error: "capability_not_found", capability };
  if (spec.app === "runtime") {
    try {
      return { ok: true, data: await runtime.execute(capability, params, timeoutMs) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return invokeAdobeCapability(broker, spec.app, capability, params, timeoutMs);
}

server.registerTool(
  "adobe_status",
  {
    description: "Show detected Adobe installs, connected host adapters and local bridge status. Does not include full project context.",
    annotations: readOnly
  },
  async () => json({
    version: ADOBE_MCP_VERSION,
    bridge: { host: "127.0.0.1", port: broker.port },
    adapters: broker.state.statuses(),
    installs: await discoverAdobeInstalls()
  })
);

server.registerTool(
  "search_capabilities",
  {
    description: "Search the compact Adobe/creative capability catalog. Query 'creative' for one-prompt job orchestration.",
    inputSchema: z.object({
      query: z.string().optional().default(""),
      app: appSchema.optional(),
      limit: z.number().int().min(1).max(100).optional().default(30)
    }),
    annotations: readOnly
  },
  async ({ query, app, limit }) => json(searchCapabilities(query, app as AdobeApp | undefined, limit))
);

server.registerTool(
  "get_capability",
  {
    description: "Get one capability definition by compact id.",
    inputSchema: z.object({ id: z.string().min(3) }),
    annotations: readOnly
  },
  async ({ id }) => {
    const capability = getCapability(id);
    return json(capability ? { ...capability, guide: getCapabilityGuide(id) } : { error: "capability_not_found", id });
  }
);

server.registerTool(
  "inspect_context",
  {
    description: "Return compact cached context for one Adobe app. Pass the previous contextHash as knownHash to avoid resending unchanged context.",
    inputSchema: z.object({
      app: appSchema,
      fresh: z.boolean().optional().default(false),
      knownHash: z.string().regex(/^[a-f0-9]{64}$/i).optional()
    }),
    annotations: readOnly
  },
  async ({ app, fresh, knownHash }) => {
    if (fresh) {
      const specialContext: Partial<Record<AdobeApp, { capability: string; params: Record<string, unknown> }>> = {
        "media-encoder": { capability: "media-encoder.queue.manage", params: { operation: "status" } },
        "lightroom-classic": { capability: "lightroom-classic.catalog.manage", params: { operation: "inspect" } },
        "acrobat": { capability: "acrobat.pdf.automate", params: { operation: "inspect" } },
        "substance-3d": { capability: "substance-3d.project.automate", params: { operation: "inspect" } }
      };
      const special = specialContext[app];
      const result = special
        ? await invokeCapability(special.capability, special.params, 30_000)
        : await broker.invoke(app, `${app}.context.inspect`, {});
      if (result.ok) {
        const data = "data" in result ? result.data : result;
        broker.state.setContext(app, data);
      }
    }

    const snapshot = broker.state.get(app);
    if (knownHash && snapshot.contextHash === knownHash) {
      const { context: _context, ...metadata } = snapshot;
      return json({ ...metadata, unchanged: true });
    }
    return json(snapshot);
  }
);

server.registerTool(
  "execute",
  {
    description: "Execute one semantic Adobe or creative-runtime capability.",
    inputSchema: z.object({
      capability: z.string().min(3),
      params: z.record(z.string(), z.unknown()).optional().default({}),
      timeoutMs: z.number().int().min(1000).max(1800000).optional().default(120000)
    }),
    annotations: write
  },
  async ({ capability, params, timeoutMs }) => json(await invokeCapability(capability, params, timeoutMs))
);

server.registerTool(
  "batch_execute",
  {
    description: "Execute an ordered multi-step Adobe/runtime job while keeping MCP overhead small.",
    inputSchema: z.object({
      steps: z.array(z.object({
        capability: z.string().min(3),
        params: z.record(z.string(), z.unknown()).optional().default({})
      })).min(1).max(200),
      stopOnError: z.boolean().optional().default(true),
      resultMode: z.enum(["compact", "full", "none"]).optional().default("compact"),
      timeoutMsPerStep: z.number().int().min(1000).max(1800000).optional().default(120000)
    }),
    annotations: write
  },
  async ({ steps, stopOnError, resultMode, timeoutMsPerStep }) => {
    const results: unknown[] = [];
    let allOk = true;
    for (const step of steps) {
      const result = await invokeCapability(step.capability, step.params, timeoutMsPerStep);
      if (!result.ok) allOk = false;
      results.push(formatBatchResult(step.capability, result, resultMode));
      if (stopOnError && !result.ok) break;
    }
    return json({ ok: allOk, resultMode, results });
  }
);


  server.server.onclose = () => {
    void broker.close();
  };
  return server;
}

const stdioHandle = serveStdio(buildServer);

const shutdown = async () => {
  await stdioHandle.close();
  await broker.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);



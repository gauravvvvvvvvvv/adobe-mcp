#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { LocalBridgeBroker } from "./broker.js";
import { getCapability, searchCapabilities } from "./catalog.js";
import { discoverAdobeInstalls } from "./discovery.js";
import { ADOBE_APPS, type AdobeApp } from "./types.js";
import { ADOBE_MCP_VERSION } from "./version.js";

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

const broker = new LocalBridgeBroker();
await broker.start();

const server = new McpServer(
  { name: "adobe-mcp", version: ADOBE_MCP_VERSION },
  {
    instructions:
      "Adobe MCP is local-first. Start with adobe_status, then search_capabilities instead of requesting a huge tool list. Use execute for one semantic action and batch_execute for multi-step edits. Prefer compact high-level intent and let the host adapter expand it into native Adobe operations. Inspect current context before destructive or timeline-sensitive work. Host adapters reconnect to the local broker, so opening/reopening an Adobe app should not require restarting the MCP server."
  }
);

const appSchema = z.enum(ADOBE_APPS);

server.registerTool(
  "adobe_status",
  {
    description: "Show detected Adobe installs, connected host adapters and local bridge status.",
    annotations: readOnly
  },
  async () => json({
    version: ADOBE_MCP_VERSION,
    bridge: { host: "127.0.0.1", port: broker.port },
    adapters: broker.state.all(),
    installs: await discoverAdobeInstalls()
  })
);

server.registerTool(
  "search_capabilities",
  {
    description: "Search the compact Adobe capability catalog. Use this instead of loading hundreds of low-level tools.",
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
    return json(capability ?? { error: "capability_not_found", id });
  }
);

server.registerTool(
  "inspect_context",
  {
    description: "Return cached context for one connected Adobe app. If fresh=true, asks the host adapter to refresh it first.",
    inputSchema: z.object({
      app: appSchema,
      fresh: z.boolean().optional().default(false)
    }),
    annotations: readOnly
  },
  async ({ app, fresh }) => {
    if (fresh) {
      const result = await broker.invoke(app, `${app}.context.inspect`, {});
      if (result.ok) broker.state.setContext(app, result.data);
    }
    return json(broker.state.get(app));
  }
);

server.registerTool(
  "execute",
  {
    description: "Execute one semantic Adobe capability through the currently connected local host adapter.",
    inputSchema: z.object({
      capability: z.string().min(3),
      params: z.record(z.string(), z.unknown()).optional().default({}),
      timeoutMs: z.number().int().min(1000).max(1800000).optional().default(120000)
    }),
    annotations: write
  },
  async ({ capability, params, timeoutMs }) => {
    const spec = getCapability(capability);
    if (!spec) return json({ ok: false, error: "capability_not_found", capability });
    const result = await broker.invoke(spec.app, capability, params, timeoutMs);
    return json(result);
  }
);

server.registerTool(
  "batch_execute",
  {
    description: "Execute an ordered multi-step Adobe edit while keeping MCP overhead small.",
    inputSchema: z.object({
      steps: z.array(z.object({
        capability: z.string().min(3),
        params: z.record(z.string(), z.unknown()).optional().default({})
      })).min(1).max(200),
      stopOnError: z.boolean().optional().default(true),
      timeoutMsPerStep: z.number().int().min(1000).max(1800000).optional().default(120000)
    }),
    annotations: write
  },
  async ({ steps, stopOnError, timeoutMsPerStep }) => {
    const results: unknown[] = [];
    for (const step of steps) {
      const spec = getCapability(step.capability);
      if (!spec) {
        const miss = { ok: false, error: "capability_not_found", capability: step.capability };
        results.push(miss);
        if (stopOnError) break;
        continue;
      }
      const result = await broker.invoke(spec.app, step.capability, step.params, timeoutMsPerStep);
      results.push({ capability: step.capability, ...result });
      if (stopOnError && !result.ok) break;
    }
    return json({ ok: results.every((r) => typeof r === "object" && r !== null && (r as { ok?: boolean }).ok !== false), results });
  }
);

const shutdown = async () => {
  await broker.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await serveStdio(server);

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { LocalBridgeBroker } from "./broker.js";
import { getCapability, searchCapabilities } from "./catalog.js";
import { CreativeRuntime } from "./creative-runtime.js";
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
const runtime = new CreativeRuntime(broker);

const server = new McpServer(
  { name: "adobe-mcp", version: ADOBE_MCP_VERSION },
  {
    instructions:
      "Adobe MCP is a local creative-agent runtime. For one-prompt creative work, search capabilities for 'creative', index source/reference assets, create and validate an EditSpec, then create/run a creative job. Use the same job ID through review and repair passes. The agent must inspect rendered/preview artifacts before recording a passing creative.job.review. For normal app work, use execute or batch_execute with compact semantic capabilities. Reuse inspect_context.contextHash as knownHash on later reads. Host adapters reconnect without restarting the MCP server."
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
  return broker.invoke(spec.app, capability, params, timeoutMs);
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
    return json(capability ?? { error: "capability_not_found", id });
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
      const result = await broker.invoke(app, `${app}.context.inspect`, {});
      if (result.ok) broker.state.setContext(app, result.data);
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
      timeoutMsPerStep: z.number().int().min(1000).max(1800000).optional().default(120000)
    }),
    annotations: write
  },
  async ({ steps, stopOnError, timeoutMsPerStep }) => {
    const results: unknown[] = [];
    for (const step of steps) {
      const result = await invokeCapability(step.capability, step.params, timeoutMsPerStep);
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

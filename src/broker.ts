import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { ADOBE_APPS, type AdobeApp, type BridgeCommand, type BridgeHello, type BridgeResult } from "./types.js";
import { StateStore } from "./state.js";

type Pending = {
  app: AdobeApp;
  resolve: (value: BridgeResult) => void;
  timer: NodeJS.Timeout;
};

type HttpAdapter = {
  lastSeen: number;
  queue: BridgeCommand[];
};

function isAdobeApp(value: unknown): value is AdobeApp {
  return typeof value === "string" && (ADOBE_APPS as readonly string[]).includes(value);
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}

async function readJson(req: IncomingMessage, maxBytes = 2 * 1024 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        reject(new Error("request_body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) as Record<string, unknown> : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

export class LocalBridgeBroker {
  readonly state = new StateStore();
  private server?: Server;
  private wss?: WebSocketServer;
  private readonly clients = new Map<AdobeApp, WebSocket>();
  private readonly httpAdapters = new Map<AdobeApp, HttpAdapter>();
  private readonly pending = new Map<string, Pending>();
  private readonly listenPort: number;
  private readonly httpAdapterTtlMs = 15_000;

  constructor(port = Number.parseInt(process.env.ADOBE_MCP_BRIDGE_PORT ?? "38470", 10)) {
    this.listenPort = port;
  }

  get port(): number {
    return this.listenPort;
  }

  private expireHttpAdapters(): void {
    const cutoff = Date.now() - this.httpAdapterTtlMs;
    for (const [app, adapter] of this.httpAdapters) {
      if (adapter.lastSeen >= cutoff) continue;
      this.httpAdapters.delete(app);
      if (!this.clients.has(app)) this.state.disconnect(app);
    }
  }

  private touchHttpAdapter(app: AdobeApp): HttpAdapter {
    let adapter = this.httpAdapters.get(app);
    if (!adapter) {
      adapter = { lastSeen: Date.now(), queue: [] };
      this.httpAdapters.set(app, adapter);
    }
    adapter.lastSeen = Date.now();
    this.state.touch(app);
    return adapter;
  }

  private resolveResult(app: AdobeApp, message: Record<string, unknown>): boolean {
    if (message.type !== "result" || typeof message.id !== "string") return false;
    const pending = this.pending.get(message.id);
    if (!pending || pending.app !== app) return false;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    pending.resolve({
      type: "result",
      id: message.id,
      ok: message.ok === true,
      data: message.data,
      error: typeof message.error === "string" ? message.error : undefined
    });
    return true;
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.listenPort}`);

    if (req.method === "GET" && url.pathname === "/health") {
      this.expireHttpAdapters();
      writeJson(res, 200, { ok: true, port: this.listenPort, apps: this.state.statuses() });
      return;
    }

    const match = /^\/adapter\/([^/]+)\/(hello|poll|result|event)$/.exec(url.pathname);
    if (!match || !isAdobeApp(match[1])) {
      writeJson(res, 404, { ok: false, error: "not_found" });
      return;
    }

    const app = match[1] as AdobeApp;
    const action = match[2];

    if (action === "hello" && req.method === "POST") {
      const message = await readJson(req);
      const capabilities = Array.isArray(message.capabilities)
        ? message.capabilities.filter((value): value is string => typeof value === "string")
        : [];
      this.httpAdapters.set(app, { lastSeen: Date.now(), queue: this.httpAdapters.get(app)?.queue ?? [] });
      this.state.connect({
        type: "hello",
        app,
        appVersion: typeof message.appVersion === "string" ? message.appVersion : undefined,
        adapterVersion: typeof message.adapterVersion === "string" ? message.adapterVersion : undefined,
        capabilities
      });
      writeJson(res, 200, { type: "hello-ack", ok: true, port: this.listenPort });
      return;
    }

    if (action === "poll" && req.method === "GET") {
      this.expireHttpAdapters();
      const adapter = this.httpAdapters.get(app);
      if (!adapter) {
        writeJson(res, 409, { ok: false, error: "hello_required" });
        return;
      }
      adapter.lastSeen = Date.now();
      this.state.touch(app);
      const command = adapter.queue.shift();
      writeJson(res, 200, command ?? { type: "noop" });
      return;
    }

    if ((action === "result" || action === "event") && req.method === "POST") {
      const message = await readJson(req);
      const adapter = this.touchHttpAdapter(app);

      if (action === "result") {
        if (!this.resolveResult(app, message)) {
          writeJson(res, 404, { ok: false, error: "pending_command_not_found" });
          return;
        }
      } else if (message.type === "event" && message.event === "context") {
        this.state.setContext(app, message.data);
      }

      adapter.lastSeen = Date.now();
      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 405, { ok: false, error: "method_not_allowed" });
  }

  async start(): Promise<number> {
    if (this.server) return this.listenPort;

    this.server = createServer((req, res) => {
      this.handleHttp(req, res).catch((error) => {
        if (res.headersSent) {
          res.end();
          return;
        }
        writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    });

    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on("connection", (socket) => this.onConnection(socket));

    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        this.server?.off("listening", onListening);
        if (error.code === "EADDRINUSE") {
          reject(new Error(
            `Adobe MCP bridge port ${this.listenPort} is already in use. ` +
            "Run one Adobe MCP instance per machine for now, or set ADOBE_MCP_BRIDGE_PORT consistently in both the server and host adapters."
          ));
          return;
        }
        reject(error);
      };
      const onListening = () => {
        this.server?.off("error", onError);
        resolve();
      };
      this.server!.once("error", onError);
      this.server!.once("listening", onListening);
      this.server!.listen(this.listenPort, "127.0.0.1");
    });

    return this.listenPort;
  }

  private onConnection(socket: WebSocket): void {
    let app: AdobeApp | undefined;

    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw)) as Record<string, unknown>;

        if (message.type === "hello" && isAdobeApp(message.app)) {
          app = message.app;
          const hello: BridgeHello = {
            type: "hello",
            app,
            appVersion: typeof message.appVersion === "string" ? message.appVersion : undefined,
            adapterVersion: typeof message.adapterVersion === "string" ? message.adapterVersion : undefined,
            capabilities: Array.isArray(message.capabilities)
              ? message.capabilities.filter((x): x is string => typeof x === "string")
              : []
          };
          const old = this.clients.get(app);
          if (old && old !== socket) old.close(4000, "replaced");
          this.clients.set(app, socket);
          this.state.connect(hello);
          socket.send(JSON.stringify({ type: "hello-ack", ok: true, port: this.listenPort }));
          return;
        }

        if (!app) {
          socket.close(4001, "hello_required");
          return;
        }

        this.state.touch(app);

        if (this.resolveResult(app, message)) return;

        if (message.type === "event" && message.event === "context") {
          this.state.setContext(app, message.data);
        }
      } catch {
        socket.send(JSON.stringify({ type: "error", error: "invalid_json" }));
      }
    });

    socket.on("close", () => {
      if (app && this.clients.get(app) === socket) {
        this.clients.delete(app);
        if (!this.httpAdapters.has(app)) this.state.disconnect(app);
      }
    });
  }

  async invoke(app: AdobeApp, op: string, params: Record<string, unknown>, timeoutMs = 120_000): Promise<BridgeResult> {
    this.expireHttpAdapters();
    const socket = this.clients.get(app);
    const httpAdapter = this.httpAdapters.get(app);
    if ((!socket || socket.readyState !== 1) && !httpAdapter) {
      return { type: "result", id: "", ok: false, error: `${app}_adapter_not_connected` };
    }

    const id = randomUUID();
    const command: BridgeCommand = { type: "command", id, op, params };

    return new Promise<BridgeResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (httpAdapter) {
          const index = httpAdapter.queue.findIndex((queued) => queued.id === id);
          if (index >= 0) httpAdapter.queue.splice(index, 1);
        }
        resolve({ type: "result", id, ok: false, error: "adapter_timeout" });
      }, Math.max(1_000, Math.min(timeoutMs, 30 * 60_000)));

      this.pending.set(id, { app, resolve, timer });

      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify(command), (error) => {
          if (!error) return;
          clearTimeout(timer);
          this.pending.delete(id);
          resolve({ type: "result", id, ok: false, error: error.message });
        });
        return;
      }

      httpAdapter!.queue.push(command);
    });
  }

  async close(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve({ type: "result", id: "", ok: false, error: "broker_closed" });
    }
    this.pending.clear();
    for (const socket of this.clients.values()) socket.close(1001, "broker_shutdown");
    this.clients.clear();
    this.httpAdapters.clear();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = undefined;
    this.wss = undefined;
  }
}

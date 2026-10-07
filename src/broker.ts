import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { ADOBE_APPS, type AdobeApp, type BridgeCommand, type BridgeHello, type BridgeResult } from "./types.js";
import { StateStore } from "./state.js";

type Pending = {
  app: AdobeApp;
  resolve: (value: BridgeResult) => void;
  timer: NodeJS.Timeout;
};

function isAdobeApp(value: unknown): value is AdobeApp {
  return typeof value === "string" && (ADOBE_APPS as readonly string[]).includes(value);
}

export class LocalBridgeBroker {
  readonly state = new StateStore();
  private server?: Server;
  private wss?: WebSocketServer;
  private readonly clients = new Map<AdobeApp, WebSocket>();
  private readonly pending = new Map<string, Pending>();
  private readonly listenPort: number;

  constructor(port = Number.parseInt(process.env.ADOBE_MCP_BRIDGE_PORT ?? "38470", 10)) {
    this.listenPort = port;
  }

  get port(): number {
    return this.listenPort;
  }

  async start(): Promise<number> {
    if (this.server) return this.listenPort;

    this.server = createServer((req, res) => {
      if (req.url === "/health") {
        const body = JSON.stringify({ ok: true, port: this.listenPort, apps: this.state.all() });
        res.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
        res.end(body);
        return;
      }
      res.writeHead(404);
      res.end();
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

        if (message.type === "result" && typeof message.id === "string") {
          const pending = this.pending.get(message.id);
          if (!pending || pending.app !== app) return;
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          pending.resolve({
            type: "result",
            id: message.id,
            ok: message.ok === true,
            data: message.data,
            error: typeof message.error === "string" ? message.error : undefined
          });
          return;
        }

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
        this.state.disconnect(app);
      }
    });
  }

  async invoke(app: AdobeApp, op: string, params: Record<string, unknown>, timeoutMs = 120_000): Promise<BridgeResult> {
    const socket = this.clients.get(app);
    if (!socket || socket.readyState !== 1) {
      return { type: "result", id: "", ok: false, error: `${app}_adapter_not_connected` };
    }

    const id = randomUUID();
    const command: BridgeCommand = { type: "command", id, op, params };

    return new Promise<BridgeResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({ type: "result", id, ok: false, error: "adapter_timeout" });
      }, Math.max(1_000, Math.min(timeoutMs, 30 * 60_000)));

      this.pending.set(id, { app, resolve, timer });
      socket.send(JSON.stringify(command), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        resolve({ type: "result", id, ok: false, error: error.message });
      });
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
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = undefined;
    this.wss = undefined;
  }
}

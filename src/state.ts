import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AdobeApp, AppSnapshot, BridgeHello } from "./types.js";

interface CacheFile {
  version: 1;
  apps: Partial<Record<AdobeApp, {
    context: unknown;
    contextHash: string;
    contextUpdatedAt: string;
  }>>;
}

function hashContext(context: unknown): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

export class StateStore {
  private readonly apps = new Map<AdobeApp, AppSnapshot>();
  private readonly cacheFile =
    process.env.ADOBE_MCP_CACHE_FILE ?? join(homedir(), ".adobe-mcp", "context-cache.json");

  constructor() {
    this.loadCache();
  }

  private loadCache(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.cacheFile, "utf8")) as CacheFile;
      if (parsed?.version !== 1 || !parsed.apps) return;

      for (const [app, value] of Object.entries(parsed.apps)) {
        if (!value) continue;
        this.apps.set(app as AdobeApp, {
          app: app as AdobeApp,
          connected: false,
          capabilities: [],
          context: value.context,
          contextHash: value.contextHash,
          contextUpdatedAt: value.contextUpdatedAt
        });
      }
    } catch {
      // First run or unreadable cache: start empty.
    }
  }

  private persistCache(): void {
    try {
      const payload: CacheFile = { version: 1, apps: {} };
      for (const [app, snapshot] of this.apps) {
        if (snapshot.context === undefined || !snapshot.contextHash || !snapshot.contextUpdatedAt) continue;
        payload.apps[app] = {
          context: snapshot.context,
          contextHash: snapshot.contextHash,
          contextUpdatedAt: snapshot.contextUpdatedAt
        };
      }
      mkdirSync(dirname(this.cacheFile), { recursive: true });
      writeFileSync(this.cacheFile, JSON.stringify(payload), "utf8");
    } catch {
      // Cache failures must never block editing.
    }
  }

  connect(hello: BridgeHello): AppSnapshot {
    const previous = this.apps.get(hello.app);
    const snapshot: AppSnapshot = {
      app: hello.app,
      connected: true,
      appVersion: hello.appVersion,
      adapterVersion: hello.adapterVersion,
      capabilities: hello.capabilities ?? [],
      lastSeenAt: new Date().toISOString(),
      context: previous?.context,
      contextHash: previous?.contextHash,
      contextUpdatedAt: previous?.contextUpdatedAt
    };
    this.apps.set(hello.app, snapshot);
    return snapshot;
  }

  disconnect(app: AdobeApp): void {
    const previous = this.apps.get(app);
    this.apps.set(app, {
      app,
      connected: false,
      appVersion: previous?.appVersion,
      adapterVersion: previous?.adapterVersion,
      capabilities: previous?.capabilities ?? [],
      lastSeenAt: new Date().toISOString(),
      context: previous?.context,
      contextHash: previous?.contextHash,
      contextUpdatedAt: previous?.contextUpdatedAt
    });
  }

  touch(app: AdobeApp): void {
    const previous = this.apps.get(app);
    if (previous) this.apps.set(app, { ...previous, lastSeenAt: new Date().toISOString() });
  }

  setContext(app: AdobeApp, context: unknown): AppSnapshot {
    const previous = this.apps.get(app) ?? { app, connected: false, capabilities: [] };
    const contextHash = hashContext(context);

    if (previous.contextHash === contextHash) {
      const unchanged = { ...previous, lastSeenAt: new Date().toISOString() };
      this.apps.set(app, unchanged);
      return unchanged;
    }

    const snapshot: AppSnapshot = {
      ...previous,
      context,
      contextHash,
      contextUpdatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
    this.apps.set(app, snapshot);
    this.persistCache();
    return snapshot;
  }

  get(app: AdobeApp): AppSnapshot {
    return this.apps.get(app) ?? { app, connected: false, capabilities: [] };
  }

  statuses(): Array<Omit<AppSnapshot, "context">> {
    return [...this.apps.values()]
      .map(({ context: _context, ...snapshot }) => snapshot)
      .sort((a, b) => a.app.localeCompare(b.app));
  }
}

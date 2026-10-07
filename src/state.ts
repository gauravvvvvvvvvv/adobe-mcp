import type { AdobeApp, AppSnapshot, BridgeHello } from "./types.js";

export class StateStore {
  private readonly apps = new Map<AdobeApp, AppSnapshot>();

  connect(hello: BridgeHello): AppSnapshot {
    const snapshot: AppSnapshot = {
      app: hello.app,
      connected: true,
      appVersion: hello.appVersion,
      adapterVersion: hello.adapterVersion,
      capabilities: hello.capabilities ?? [],
      lastSeenAt: new Date().toISOString(),
      context: this.apps.get(hello.app)?.context
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
      context: previous?.context
    });
  }

  touch(app: AdobeApp): void {
    const previous = this.apps.get(app);
    if (previous) this.apps.set(app, { ...previous, lastSeenAt: new Date().toISOString() });
  }

  setContext(app: AdobeApp, context: unknown): void {
    const previous = this.apps.get(app) ?? { app, connected: false, capabilities: [] };
    this.apps.set(app, { ...previous, context, lastSeenAt: new Date().toISOString() });
  }

  get(app: AdobeApp): AppSnapshot {
    return this.apps.get(app) ?? { app, connected: false, capabilities: [] };
  }

  all(): AppSnapshot[] {
    return [...this.apps.values()].sort((a, b) => a.app.localeCompare(b.app));
  }
}

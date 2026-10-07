export const ADOBE_APPS = [
  "premiere",
  "after-effects",
  "photoshop",
  "illustrator",
  "audition",
  "media-encoder",
  "indesign",
  "animate",
  "lightroom-classic",
  "acrobat",
  "bridge",
  "substance-3d"
] as const;

export type AdobeApp = (typeof ADOBE_APPS)[number];

export type CapabilityRisk = "read" | "write" | "destructive";

export interface Capability {
  id: string;
  app: AdobeApp;
  title: string;
  description: string;
  tags: string[];
  risk: CapabilityRisk;
  params?: Record<string, unknown>;
}

export interface BridgeHello {
  type: "hello";
  app: AdobeApp;
  appVersion?: string;
  adapterVersion?: string;
  capabilities?: string[];
}

export interface BridgeCommand {
  type: "command";
  id: string;
  op: string;
  params: Record<string, unknown>;
}

export interface BridgeResult {
  type: "result";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface BridgeEvent {
  type: "event";
  event: string;
  data?: unknown;
}

export interface AppSnapshot {
  app: AdobeApp;
  connected: boolean;
  appVersion?: string;
  adapterVersion?: string;
  capabilities: string[];
  lastSeenAt?: string;
  context?: unknown;
  contextHash?: string;
  contextUpdatedAt?: string;
}

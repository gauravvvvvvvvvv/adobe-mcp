import type { LocalBridgeBroker } from "./broker.js";
import { compileInvocation } from "./compilers/index.js";
import type { AdobeApp } from "./types.js";

export async function invokeAdobeCapability(
  broker: LocalBridgeBroker,
  app: AdobeApp,
  capability: string,
  params: Record<string, unknown>,
  timeoutMs = 120_000
) {
  return broker.invoke(app, capability, compileInvocation(capability, params), timeoutMs);
}

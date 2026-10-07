import test from "node:test";
import assert from "node:assert/strict";
import { runtimeLimits } from "../src/limits.js";
import { CAPABILITIES } from "../src/catalog.js";

test("runtime limit registry makes host ceilings explicit", () => {
  const all = runtimeLimits();
  assert.ok(all.length >= 6);
  assert.ok(all.some((item) => item.id === "premiere.audio-track-mixer" && item.status === "host-limited"));
  assert.ok(all.some((item) => item.id === "uxp-ccx-packaging" && item.status === "tooling-required"));
  assert.ok(runtimeLimits("premiere").every((item) => item.host.includes("premiere")));
  assert.ok(CAPABILITIES.some((capability) => capability.id === "creative.runtime.limits"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { CAPABILITIES, searchCapabilities } from "../src/catalog.js";
import { capabilityGuideIds, getCapabilityGuide } from "../src/capability-guides.js";

test("high-value capability guides are on-demand and reference real capabilities", () => {
  const timeline = getCapabilityGuide("premiere.timeline.edit");
  assert.ok(timeline);
  assert.ok(timeline.operations?.includes("extract"));
  assert.equal((timeline.example as any).operation, "extract");

  const assets = getCapabilityGuide("creative.assets.analyze");
  assert.ok(assets);
  assert.ok(assets.required?.includes("paths[]"));

  const known = new Set(CAPABILITIES.map((capability) => capability.id));
  for (const id of capabilityGuideIds()) assert.ok(known.has(id), "guide references missing capability " + id);

  const search = searchCapabilities("timeline", "premiere", 10);
  assert.ok(search.length > 0);
  assert.ok(search.every((item) => !Object.prototype.hasOwnProperty.call(item, "guide")));
});

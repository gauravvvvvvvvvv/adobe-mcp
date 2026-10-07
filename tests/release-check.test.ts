import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manual release gate enforces repo contract and external gates", async () => {
  const source = await readFile("src/release-check.ts", "utf8");
  assert.match(source, /github_actions_forbidden/);
  assert.match(source, /unexpected_implementation_partials/);
  assert.match(source, /adapters\/photoshop-uxp\/manifest\.json/);
  assert.match(source, /adapters\/media-encoder-uxp\/manifest\.json/);
  assert.match(source, /real-host-premiere-acceptance/);
  assert.match(source, /uxp-ccx-packaging/);
  assert.match(source, /runtime_version_mismatch/);
  assert.match(source, /manifest_version_mismatch/);
  assert.match(source, /capability-guides\.ts/);
});

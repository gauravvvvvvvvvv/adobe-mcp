import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITIES } from "../src/catalog.js";
import { auditCapabilitySources } from "../src/capability-coverage.js";

test("every advertised capability has an implementation source", async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, "..");
  const audit = await auditCapabilitySources(root, CAPABILITIES);
  assert.deepEqual(audit.duplicateIds, []);
  assert.deepEqual(audit.missing, []);
  assert.equal(audit.ok, true);
});

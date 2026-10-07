import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("doctor covers every shipped adapter family", async () => {
  const source = await readFile("src/doctor.ts", "utf8");
  for (const needle of [
    "cep-universal",
    "photoshop-uxp",
    "media-encoder-uxp",
    "lightroom-classic",
    "adapters\", \"acrobat",
    "substance-3d-painter"
  ]) assert.ok(source.includes(needle), "missing doctor check for " + needle);
  assert.match(source, /connectedApps/);
  assert.match(source, /readyForCreativeVideo/);
});

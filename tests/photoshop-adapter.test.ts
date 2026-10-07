import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Photoshop UXP adapter parses and requests autonomous local path access", async () => {
  const source = await readFile("adapters/photoshop-uxp/main.js", "utf8");
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /createDocument/);
  assert.match(source, /createTextLayer/);
  assert.match(source, /resizeImage/);
  assert.match(source, /placedLayerReplaceContents/);
  assert.match(source, /placedLayerRelinkToFile/);
  assert.match(source, /placedLayerEditContents/);
  assert.match(source, /newPlacedLayer/);
  assert.match(source, /layer\.translate/);
  assert.match(source, /bringToFront/);
  assert.match(source, /sendToBack/);
  assert.match(source, /createLayer\(kind/);
  assert.match(source, /characterStyle/);
  assert.match(source, /paragraphStyle/);
  assert.match(source, /applyAddNoise/);
  assert.match(source, /saveAs\.png/);
  assert.match(source, /executeAsModal/);

  const manifest = JSON.parse(await readFile("adapters/photoshop-uxp/manifest.json", "utf8"));
  assert.equal(manifest.manifestVersion, 5);
  assert.equal(manifest.requiredPermissions.localFileSystem, "fullAccess");
  assert.equal(manifest.host.minVersion, "24.2.0");
});

test("Photoshop adapter retains descriptor escape hatch", async () => {
  const source = await readFile("adapters/photoshop-uxp/main.js", "utf8");
  assert.match(source, /runBatchPlay/);
  assert.match(source, /params\.descriptors/);
  assert.match(source, /action\.batchPlay/);
});

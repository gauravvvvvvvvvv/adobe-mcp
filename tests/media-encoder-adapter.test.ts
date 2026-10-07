import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Media Encoder UXP adapter exposes official render queue operations", async () => {
  const source = await readFile("adapters/media-encoder-uxp/main.js", "utf8");
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /require\("mediaencoder"\)/);
  assert.match(source, /enqueueFile/);
  assert.match(source, /renderFile/);
  assert.match(source, /stitchFiles/);
  assert.match(source, /enqueueImagesAsSequence/);
  assert.match(source, /getMissingAssets/);
  assert.match(source, /getProjectItemGUIDs/);
  assert.match(source, /getJobGroup/);
  assert.match(source, /removeAllJobs/);
  assert.match(source, /media-encoder\.context\.inspect/);
  assert.match(source, /media-encoder\.presets\.manage/);
  assert.match(source, /presetManage/);
  assert.match(source, /\.epr\$\/i/);

  const manifest = JSON.parse(await readFile("adapters/media-encoder-uxp/manifest.json", "utf8"));
  assert.equal(manifest.manifestVersion, 5);
  assert.equal(manifest.host.app, "ame");
  assert.equal(manifest.host.minVersion, "27.0.0");
  assert.equal(manifest.requiredPermissions.localFileSystem, "fullAccess");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Lightroom Classic plugin declares startup and localhost polling bridge", async () => {
  const info = await readFile("adapters/lightroom-classic/AdobeMCP.lrplugin/Info.lua", "utf8");
  const init = await readFile("adapters/lightroom-classic/AdobeMCP.lrplugin/Init.lua", "utf8");
  assert.match(info, /LrInitPlugin/);
  assert.match(init, /LrTasks\.startAsyncTaskWithoutErrorHandler/);
  assert.match(init, /127\.0\.0\.1:38470/);
  assert.match(init, /lightroom-classic\.catalog\.manage/);
  assert.match(init, /withWriteAccessDo/);
  assert.match(init, /addDevelopPresetForPlugin/);
  assert.match(init, /LrExportSession/);
  assert.match(init, /metadata\.set/);
});

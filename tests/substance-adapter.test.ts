import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Substance Painter startup plugin uses typed Python API and reconnecting WebSocket", async () => {
  const source = await readFile("adapters/substance-3d-painter/python/startup/adobe_mcp.py", "utf8");
  assert.match(source, /PySide6\.QtWebSockets/);
  assert.match(source, /PySide2\.QtWebSockets/);
  assert.match(source, /ws:\/\/127\.0\.0\.1:38470/);
  assert.match(source, /substance-3d\.project\.automate/);
  assert.match(source, /sp\.project\.create/);
  assert.match(source, /sp\.layerstack\.ScopedModification/);
  assert.match(source, /sp\.layerstack\.insert_fill/);
  assert.match(source, /sp\.resource\.search/);
  assert.match(source, /sp\.export\.export_project_textures/);
  assert.match(source, /def start_plugin\(\)/);
  assert.match(source, /def close_plugin\(\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("MCP stdio entrypoint uses the v2 server factory lifecycle", async () => {
  const source = await readFile("src/index.ts", "utf8");
  assert.match(source, /function buildServer\(\)/);
  assert.match(source, /serveStdio\(buildServer\)/);
  assert.match(source, /server\.server\.onclose/);
  assert.match(source, /stdioHandle\.close\(\)/);
  assert.doesNotMatch(source, /serveStdio\(server\)/);
  assert.doesNotMatch(source, /await serveStdio/);
});

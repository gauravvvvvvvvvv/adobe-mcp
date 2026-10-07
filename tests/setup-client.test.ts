import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("client setup uses current Codex and Claude stdio registration shapes", async () => {
  const source = await readFile("src/setup-client.ts", "utf8");
  assert.match(source, /codex", \["mcp", "add", "adobe", "--", serverCommand\]/);
  assert.match(source, /"mcp", "add", "--transport", "stdio", "--scope", claudeScope/);
  assert.match(source, /\["user", "local", "project"\]\.includes\(claudeScope\)/);
  assert.match(source, /"mcp", "remove", "adobe", "--scope", claudeScope/);
  assert.match(source, /run\("codex", \["mcp", "get", "adobe"\]\)/);
  assert.match(source, /run\("claude", \["mcp", "get", "adobe"\]\)/);
  assert.match(source, /stage: "verify"/);
  assert.match(source, /cmd", "\/c", serverCommand/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import { discoverAdobeInstalls } from "../src/discovery.js";

test("discovery honors explicit custom install paths and filtered scan roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-discovery-"));
  const explicit = join(root, "Custom Creative Host");
  const scanned = join(root, "Adobe Premiere Pro 2099");
  const ignored = join(root, "Unrelated Application");
  await mkdir(explicit);
  await mkdir(scanned);
  await mkdir(ignored);

  const oldDirs = process.env.ADOBE_MCP_APP_DIRS;
  const oldPaths = process.env.ADOBE_MCP_APP_PATHS;
  process.env.ADOBE_MCP_APP_DIRS = root;
  process.env.ADOBE_MCP_APP_PATHS = explicit + delimiter + explicit;

  try {
    const installs = await discoverAdobeInstalls();
    assert.ok(installs.some((item) => item.path === explicit));
    assert.ok(installs.some((item) => item.path === scanned));
    assert.equal(installs.filter((item) => item.path === explicit).length, 1);
    assert.ok(!installs.some((item) => item.path === ignored));
  } finally {
    if (oldDirs === undefined) delete process.env.ADOBE_MCP_APP_DIRS;
    else process.env.ADOBE_MCP_APP_DIRS = oldDirs;
    if (oldPaths === undefined) delete process.env.ADOBE_MCP_APP_PATHS;
    else process.env.ADOBE_MCP_APP_PATHS = oldPaths;
    await rm(root, { recursive: true, force: true });
  }
});

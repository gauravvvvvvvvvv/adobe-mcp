import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeAssets } from "../src/asset-analysis.js";

test("asset analysis groups exact duplicates and reuses the persistent cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "adobe-mcp-assets-"));
  const previousCache = process.env.ADOBE_MCP_ASSET_CACHE_DIR;
  process.env.ADOBE_MCP_ASSET_CACHE_DIR = join(root, "cache");
  try {
    const one = join(root, "one.txt");
    const two = join(root, "two.txt");
    await writeFile(one, "same creative source\n", "utf8");
    await writeFile(two, "same creative source\n", "utf8");

    const first = await analyzeAssets([one, two], { exactHash: true });
    assert.equal(first.assets.length, 2);
    assert.equal(first.exactDuplicateGroups.length, 1);
    assert.deepEqual(new Set(first.exactDuplicateGroups[0].paths), new Set([one, two]));
    assert.equal(first.cacheHits, 0);

    const second = await analyzeAssets([one, two], { exactHash: true });
    assert.equal(second.cacheHits, 2);
    assert.equal(second.exactDuplicateGroups.length, 1);
  } finally {
    if (previousCache === undefined) delete process.env.ADOBE_MCP_ASSET_CACHE_DIR;
    else process.env.ADOBE_MCP_ASSET_CACHE_DIR = previousCache;
    await rm(root, { recursive: true, force: true });
  }
});

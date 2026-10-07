import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Acrobat folder script uses trusted localhost poll transport and document APIs", async () => {
  const source = await readFile("adapters/acrobat/AdobeMCP.js", "utf8");
  assert.match(source, /app\.trustedFunction/);
  assert.match(source, /Net\.HTTP\.request/);
  assert.match(source, /127\.0\.0\.1:38470/);
  assert.match(source, /acrobat\.pdf\.automate/);
  assert.match(source, /insertPages/);
  assert.match(source, /deletePages/);
  assert.match(source, /setPageRotations/);
  assert.match(source, /addWatermarkFromText/);
  assert.match(source, /addField/);
});

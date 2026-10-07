import test from "node:test";
import assert from "node:assert/strict";
import { validateEditSpec } from "../src/creative-spec.js";

test("valid EditSpec parses with defaults", () => {
  const result = validateEditSpec({
    title: "Test edit",
    prompt: "Make a concise edit",
    workingFiles: ["C:\\project\\main.prproj"],
    deliverables: [{ id: "final", outputPath: "C:\\out\\final.mp4", kind: "video" }],
    acceptanceCriteria: [{ id: "clean", description: "The edit has clean cuts." }]
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.spec.version, 1);
    assert.equal(result.spec.review.maxPasses, 3);
    assert.deepEqual(result.spec.intent.style, []);
    assert.equal(result.spec.workingFiles.length, 1);
  }
});

test("EditSpec rejects missing deliverables and acceptance criteria", () => {
  const result = validateEditSpec({ title: "Bad", prompt: "No output" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    const paths = result.issues.map((issue) => issue.path);
    assert.ok(paths.includes("deliverables"));
    assert.ok(paths.includes("acceptanceCriteria"));
  }
});

test("EditSpec rejects malformed operation IDs", () => {
  const result = validateEditSpec({
    title: "Bad operation",
    prompt: "test",
    deliverables: [{ id: "final", outputPath: "out.mp4", kind: "video" }],
    acceptanceCriteria: [{ id: "ok", description: "Output exists" }],
    operations: [{
      id: "spaces are invalid",
      phase: "assembly",
      capability: "premiere.timeline.edit",
      params: {}
    }]
  });
  assert.equal(result.ok, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { expandRecipe, listRecipes } from "../src/recipes.js";

test("recipe catalog exposes reusable professional workflows", () => {
  const ids = listRecipes().map((recipe) => recipe.id);
  assert.ok(ids.includes("premiere.master-edit"));
  assert.ok(ids.includes("premiere.rough-cut"));
  assert.ok(ids.includes("premiere.beat-cut"));
  assert.ok(ids.includes("after-effects.lower-third"));
  assert.ok(ids.includes("after-effects.hud"));
  assert.ok(ids.includes("after-effects.composite-vfx"));
  assert.ok(ids.includes("after-effects.kinetic-typography"));
  assert.ok(ids.includes("photoshop.composite"));
  assert.ok(ids.includes("illustrator.logo-system"));
});

test("rough-cut recipe expands into semantic assembly plus QA", () => {
  const recipe = expandRecipe("premiere.rough-cut", {
    clips: [
      { path: "C:\\media\\a.mp4", sourceIn: 0, sourceOut: 2.4 },
      { path: "C:\\media\\b.mp4", sourceIn: 5, sourceOut: 7.5 }
    ],
    sequence: "Main"
  });
  assert.equal(recipe.output.operations[0].capability, "premiere.timeline.assemble");
  assert.equal(recipe.output.operations.at(-1)?.capability, "premiere.timeline.qa");
  assert.ok(recipe.output.acceptanceCriteria.some((criterion) => criterion.id === "timeline.clean"));
});

test("kinetic typography recipe remains compact while producing multiple operations", () => {
  const recipe = expandRecipe("after-effects.kinetic-typography", {
    composition: "Main",
    lines: ["BUILD", "MOVE", "SHIP"],
    stepSeconds: 0.5
  });
  assert.equal(recipe.output.operations.length, 3);
  assert.ok(recipe.output.operations.every((operation) => operation.capability === "after-effects.text.animate"));
});

test("master edit expands finishing, QA and export operations", () => {
  const recipe = expandRecipe("premiere.master-edit", {
    sequence: "Master",
    clips: [{ path: "C:\\media\\a.mp4", sourceIn: 0, sourceOut: 3 }],
    audioTarget: { trackIndex: 0, clipIndex: 0 },
    duckingWindows: [{ start: 0.5, end: 2, db: -18 }],
    gradeTarget: { trackIndex: 0, clipIndex: 0 },
    gradeAdjustments: { Exposure: 0.2 },
    captionPath: "C:\\media\\captions.srt",
    outputPath: "C:\\out\\master.mp4",
    presetPath: "C:\\presets\\master.epr"
  });
  const capabilities = recipe.output.operations.map((operation) => operation.capability);
  assert.ok(capabilities.includes("premiere.timeline.assemble"));
  assert.ok(capabilities.includes("premiere.audio.mix"));
  assert.ok(capabilities.includes("premiere.color.grade"));
  assert.ok(capabilities.includes("premiere.captions.manage"));
  assert.ok(capabilities.includes("premiere.timeline.qa"));
  assert.ok(capabilities.includes("premiere.export.render"));
});

test("AE finishing recipes expand entirely to semantic capabilities", () => {
  const lower = expandRecipe("after-effects.lower-third", { title: "Gaurav", subtitle: "Engineer" });
  assert.ok(lower.output.operations.some((operation) => operation.capability === "after-effects.shapes.draw"));
  assert.ok(lower.output.operations.some((operation) => operation.capability === "after-effects.text.animate"));

  const hud = expandRecipe("after-effects.hud", { label: "TARGET" });
  assert.ok(hud.output.operations.every((operation) => operation.capability.startsWith("after-effects.")));

  const composite = expandRecipe("after-effects.composite-vfx", {
    platePath: "C:\\media\\plate.mov",
    overlayPath: "C:\\media\\smoke.mov",
    mask: { vertices: [[0,0],[100,0],[100,100],[0,100]] }
  });
  assert.ok(composite.output.operations.some((operation) => operation.capability === "after-effects.masks.mattes"));
});

test("unknown recipe fails explicitly", () => {
  assert.throws(() => expandRecipe("not.real", {}), /creative_recipe_not_found/);
});

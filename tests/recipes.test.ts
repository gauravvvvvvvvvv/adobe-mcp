import test from "node:test";
import assert from "node:assert/strict";
import { expandRecipe, listRecipes } from "../src/recipes.js";

test("recipe catalog exposes reusable professional workflows", () => {
  const ids = listRecipes().map((recipe) => recipe.id);
  assert.ok(ids.includes("premiere.rough-cut"));
  assert.ok(ids.includes("premiere.beat-cut"));
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

test("unknown recipe fails explicitly", () => {
  assert.throws(() => expandRecipe("not.real", {}), /creative_recipe_not_found/);
});

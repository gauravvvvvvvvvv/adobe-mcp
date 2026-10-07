import test from "node:test";
import assert from "node:assert/strict";
import { js } from "../src/compilers/common.js";
import { compileInvocation } from "../src/compilers/index.js";

function scriptFor(capability: string, params: Record<string, unknown>): string {
  const compiled = compileInvocation(capability, params);
  assert.equal(compiled.compiledBy, "adobe-mcp");
  assert.equal(typeof compiled.script, "string");
  return compiled.script as string;
}

function parses(script: string) {
  assert.doesNotThrow(() => new Function("return " + script));
}

test("js literal escaping prevents line-separator injection", () => {
  assert.equal(js("a\u2028b\u2029c"), '"a\\u2028b\\u2029c"');
  assert.equal(js(undefined), "null");
});

test("Premiere project import compiles paths as data, not source", () => {
  const attack = 'C:\\media\\x"; app.project.saveAs("PWNED"); // .mp4';
  const script = scriptFor("premiere.project.manage", { operation: "import", paths: [attack] });
  parses(script);
  assert.ok(script.includes(JSON.stringify(attack)));
  assert.equal(script.includes('var paths=["C:\\media\\x"; app.project.saveAs'), false);
});

test("Premiere assembly and edit compile into ExtendScript", () => {
  const assembly = scriptFor("premiere.timeline.assemble", {
    clips: [{ path: "C:\\media\\a.mp4", sourceIn: 1, sourceOut: 3.5, videoTrack: 0, audioTrack: 0 }]
  });
  parses(assembly);
  assert.match(assembly, /setInPoint/);
  assert.match(assembly, /insertClip/);

  const move = scriptFor("premiere.timeline.edit", {
    operation: "move",
    target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
    time: 5
  });
  parses(move);
  assert.match(move, /clip\.move/);
});

test("Premiere motion, audio and export compilers emit host operations", () => {
  const motion = scriptFor("premiere.motion.animate", {
    target: { trackIndex: 0, clipIndex: 0 },
    keyframes: [{ time: 0, property: "Scale", value: 100 }, { time: 1, property: "Scale", value: 120 }]
  });
  parses(motion);
  assert.match(motion, /setValueAtKey/);

  const audio = scriptFor("premiere.audio.mix", {
    target: { trackIndex: 0, clipIndex: 0 },
    levelDb: -6
  });
  parses(audio);
  assert.match(audio, /Math\.pow\(10/);

  const render = scriptFor("premiere.export.render", {
    outputPath: "C:\\out\\final.mp4",
    presetPath: "C:\\presets\\h264.epr"
  });
  parses(render);
  assert.match(render, /encodeSequence/);
});

test("After Effects compilers parse and use undo groups", () => {
  const comp = scriptFor("after-effects.composition.manage", {
    operation: "create", name: "Main", width: 1920, height: 1080, duration: 5, frameRate: 30
  });
  parses(comp);
  assert.match(comp, /beginUndoGroup/);

  const animation = scriptFor("after-effects.properties.animate", {
    target: { name: "Logo" },
    keyframes: [{ time: 0, path: ["ADBE Transform Group", "ADBE Scale"], value: [80, 80] }]
  });
  parses(animation);
  assert.match(animation, /setValueAtTime/);
});

test("Illustrator vector compiler parses", () => {
  const vector = scriptFor("illustrator.vector.create", {
    shape: "rectangle", name: "Card", x: 0, y: 500, width: 300, height: 200, fill: [255, 0, 0]
  });
  parses(vector);
  assert.match(vector, /pathItems\.rectangle/);
});

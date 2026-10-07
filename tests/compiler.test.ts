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

test("Premiere project lifecycle compiles open new and close operations", () => {
  const open = scriptFor("premiere.project.manage", { operation: "open", path: "C:\\work\\copy.prproj" });
  parses(open);
  assert.match(open, /app\.openDocument/);

  const create = scriptFor("premiere.project.manage", { operation: "new", path: "C:\\work\\scratch.prproj" });
  parses(create);
  assert.match(create, /app\.newProject/);

  const close = scriptFor("premiere.project.manage", { operation: "close", save: true });
  parses(close);
  assert.match(close, /project\.save/);
  assert.match(close, /closeDocument/);
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

test("Premiere crop and time remapping compile into typed property animation", () => {
  const crop = scriptFor("premiere.motion.animate", {
    target: { trackIndex: 0, clipIndex: 0 },
    crop: { left: 5, right: 7 },
    cropKeyframes: [
      { time: 0, top: 0, bottom: 0 },
      { time: 1, top: 12, bottom: 8 }
    ]
  });
  parses(crop);
  assert.match(crop, /Effect not found: /);
  assert.match(crop, /"Crop"/);
  assert.match(crop, /Crop property not found/);
  assert.match(crop, /setValueAtKey/);

  const remap = scriptFor("premiere.motion.animate", {
    target: { trackIndex: 0, clipIndex: 0 },
    timeRemap: [
      { time: 0, speedPercent: 100 },
      { time: 1, speedPercent: 250 },
      { time: 2, speedPercent: 100 }
    ]
  });
  parses(remap);
  assert.match(remap, /Time Remapping/);
  assert.match(remap, /Speed property not found/);
  assert.match(remap, /250/);
});

test("Premiere razor, pan, ducking and track mute compile into safe host operations", () => {
  const razor = scriptFor("premiere.timeline.edit", {
    operation: "razor",
    target: { trackType: "video", trackIndex: 1 },
    time: 12.5,
    fps: 30
  });
  parses(razor);
  assert.match(razor, /\.razor\(tc\)/);
  assert.match(razor, /timecode/);

  const pan = scriptFor("premiere.audio.mix", {
    target: { trackIndex: 0, clipIndex: 0 },
    pan: -25
  });
  parses(pan);
  assert.match(pan, /Volume Pan property not found/);

  const duck = scriptFor("premiere.audio.mix", {
    target: { trackIndex: 0, clipIndex: 0 },
    baseDb: -6,
    fadeSeconds: 0.2,
    duckingWindows: [{ start: 2, end: 4, db: -20 }]
  });
  parses(duck);
  assert.match(duck, /setValueAtKey/);
  assert.match(duck, /duckingWindows/);

  const mute = scriptFor("premiere.audio.mix", {
    operation: "trackMute",
    trackIndex: 1,
    muted: true
  });
  parses(mute);
  assert.match(mute, /setMute\(1\)/);
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

test("After Effects composition configuration rich keyframes expressions and render controls compile", () => {
  const configure = scriptFor("after-effects.composition.manage", {
    operation: "configure",
    composition: "Main",
    width: 1080,
    height: 1920,
    duration: 12,
    frameRate: 30,
    workAreaStart: 1,
    workAreaDuration: 10,
    motionBlur: true,
    shutterAngle: 180
  });
  parses(configure);
  assert.match(configure, /c\.width=1080/);
  assert.match(configure, /c\.workAreaDuration=10/);
  assert.match(configure, /c\.shutterAngle=180/);

  const animation = scriptFor("after-effects.properties.animate", {
    target: { name: "Card" },
    keyframes: [
      {
        time: 0,
        property: "ADBE Opacity",
        value: 0,
        interpolation: "hold"
      },
      {
        time: 1,
        property: "ADBE Opacity",
        value: 100,
        interpolation: "bezier",
        temporalAutoBezier: true
      }
    ],
    expression: {
      path: ["ADBE Transform Group", "ADBE Rotate Z"],
      value: "wiggle(1,5)"
    }
  });
  parses(animation);
  assert.match(animation, /KeyframeInterpolationType\.HOLD/);
  assert.match(animation, /setInterpolationTypeAtKey/);
  assert.match(animation, /canSetExpression/);
  assert.match(animation, /expressionEnabled/);

  const inspect = scriptFor("after-effects.render.queue", { operation: "inspect" });
  parses(inspect);
  assert.match(inspect, /rq\.numItems/);
  assert.match(inspect, /elapsedSeconds/);

  const pause = scriptFor("after-effects.render.queue", { operation: "pause", paused: true });
  parses(pause);
  assert.match(pause, /pauseRendering\(true\)/);

  const stop = scriptFor("after-effects.render.queue", { operation: "stop" });
  parses(stop);
  assert.match(stop, /stopRendering/);
});

test("After Effects native text animators Bezier paths and blend modes compile", () => {
  const text = scriptFor("after-effects.text.animate", {
    text: "KINETIC",
    animator: {
      name: "Reveal",
      opacity: 0,
      position: [0, 80, 0],
      start: 0,
      end: 100,
      selectorKeyframes: [
        { time: 0, offset: -100 },
        { time: 1, offset: 100 }
      ]
    }
  });
  parses(text);
  assert.match(text, /ADBE Text Animator/);
  assert.match(text, /ADBE Text Selector/);
  assert.match(text, /ADBE Text Percent Offset/);

  const path = scriptFor("after-effects.shapes.draw", {
    shape: "path",
    vertices: [[0, 0], [200, -80], [400, 0]],
    inTangents: [[0, 0], [-60, 0], [-60, 0]],
    outTangents: [[60, 0], [60, 0], [0, 0]],
    closed: false,
    fill: false,
    stroke: [1, 1, 1],
    strokeWidth: 6
  });
  parses(path);
  assert.match(path, /new Shape\(\)/);
  assert.match(path, /ADBE Vector Shape/);
  assert.match(path, /shapeValue\.vertices/);

  const blend = scriptFor("after-effects.masks.mattes", {
    operation: "blendMode",
    target: { name: "Glow" },
    blendMode: "screen"
  });
  parses(blend);
  assert.match(blend, /BlendingMode\.SCREEN/);
});

test("After Effects masks effects 3D footage and advanced shapes compile", () => {
  const footage = scriptFor("after-effects.layers.manage", {
    operation: "footage",
    path: "C:\\media\\plate.mov",
    name: "Plate",
    threeDLayer: true
  });
  parses(footage);
  assert.match(footage, /ImportOptions/);
  assert.match(footage, /app\.project\.importFile/);

  const mask = scriptFor("after-effects.masks.mattes", {
    target: { name: "Plate" },
    operation: "mask",
    vertices: [[0,0],[300,0],[300,200],[0,200]],
    feather: [10,10]
  });
  parses(mask);
  assert.match(mask, /new Shape\(\)/);
  assert.match(mask, /ADBE Mask Shape/);

  const matte = scriptFor("after-effects.masks.mattes", {
    target: { name: "Plate" },
    operation: "trackMatte",
    matte: { name: "Matte" },
    type: "alpha"
  });
  parses(matte);
  assert.match(matte, /setTrackMatte/);

  const effect = scriptFor("after-effects.effects.apply", {
    target: { name: "Plate" },
    operation: "effect",
    name: "ADBE Gaussian Blur 2",
    parameters: { "Blurriness": 20 }
  });
  parses(effect);
  assert.match(effect, /ADBE Effect Parade/);
  assert.match(effect, /addProperty/);

  const scene = scriptFor("after-effects.three-d.scene", {
    operation: "configure",
    target: { name: "Plate" },
    position: [960,540,-500],
    yRotation: 10
  });
  parses(scene);
  assert.match(scene, /threeDLayer/);
  assert.match(scene, /ADBE Rotate Y/);

  const shape = scriptFor("after-effects.shapes.draw", {
    shape: "rectangle",
    stroke: [1,0,0],
    strokeWidth: 6,
    trim: { start: 0, end: 75 },
    repeater: { copies: 4, position: [40,0] }
  });
  parses(shape);
  assert.match(shape, /ADBE Vector Graphic - Stroke/);
  assert.match(shape, /ADBE Vector Filter - Trim/);
  assert.match(shape, /ADBE Vector Filter - Repeater/);
});

test("Illustrator vector compiler parses", () => {
  const vector = scriptFor("illustrator.vector.create", {
    shape: "rectangle", name: "Card", x: 0, y: 500, width: 300, height: 200, fill: [255, 0, 0]
  });
  parses(vector);
  assert.match(vector, /pathItems\.rectangle/);
});

test("Illustrator alignment gradient symbols trace and PDF export compile", () => {
  const align = scriptFor("illustrator.vector.transform", {
    operation: "align",
    targets: [{ name: "A" }, { name: "B" }],
    mode: "hCenter",
    reference: "artboard"
  });
  parses(align);
  assert.match(align, /artboardRect/);
  assert.match(align, /translate\(dx,dy\)/);

  const gradient = scriptFor("illustrator.appearance.style", {
    target: { name: "Card" },
    gradient: {
      type: "linear",
      angle: 45,
      stops: [
        { rampPoint: 0, color: [255,0,0] },
        { rampPoint: 100, color: [0,0,255] }
      ]
    }
  });
  parses(gradient);
  assert.match(gradient, /new GradientColor/);
  assert.match(gradient, /gradientStops/);

  const symbol = scriptFor("illustrator.symbols.patterns", {
    operation: "createSymbol",
    target: { name: "LogoMark" },
    name: "LogoSymbol"
  });
  parses(symbol);
  assert.match(symbol, /symbols\.add/);

  const trace = scriptFor("illustrator.image.trace", {
    path: "C:\\assets\\sketch.png",
    mode: "blackandwhite",
    threshold: 140,
    expand: true
  });
  parses(trace);
  assert.match(trace, /placed\.trace\(\)/);
  assert.match(trace, /expandTracing/);

  const pdf = scriptFor("illustrator.export.assets", {
    path: "C:\\out\\brand.pdf",
    format: "pdf"
  });
  parses(pdf);
  assert.match(pdf, /PDFSaveOptions/);
  assert.match(pdf, /saveAs/);
});

test("InDesign layout compiler covers document text image styles links and export", () => {
  const doc = scriptFor("indesign.document.layout", { operation: "createDocument", pageWidth: 210, pageHeight: 297, pages: 4 });
  parses(doc);
  assert.match(doc, /documents\.add/);
  assert.match(doc, /documentPreferences\.pageWidth/);

  const text = scriptFor("indesign.document.layout", {
    operation: "textFrame",
    page: 0,
    bounds: [20,20,80,180],
    contents: "Quarterly Review",
    paragraphStyle: "Title"
  });
  parses(text);
  assert.match(text, /textFrames\.add/);
  assert.match(text, /geometricBounds/);

  const image = scriptFor("indesign.document.layout", {
    operation: "imageFrame",
    path: "C:\\assets\\hero.jpg",
    bounds: [90,20,250,180]
  });
  parses(image);
  assert.match(image, /rectangles\.add/);
  assert.match(image, /\.place\(f\)/);

  const style = scriptFor("indesign.document.layout", {
    operation: "paragraphStyle",
    name: "Body",
    font: "Arial",
    pointSize: 11,
    leading: 14
  });
  parses(style);
  assert.match(style, /paragraphStyles/);

  const pdf = scriptFor("indesign.document.layout", {
    operation: "export",
    path: "C:\\out\\review.pdf",
    format: "pdf"
  });
  parses(pdf);
  assert.match(pdf, /ExportFormat\.PDF_TYPE/);
});

test("Animate Audition and Bridge semantic compilers generate parseable scripts", () => {
  const animate = scriptFor("animate.timeline.author", {
    operation: "addText",
    text: "Launch",
    left: 100,
    top: 100,
    right: 900,
    bottom: 260
  });
  parses(animate);
  assert.match(animate, /addNewText/);

  const key = scriptFor("animate.timeline.author", {
    operation: "keyframe",
    layerIndex: 0,
    frame: 12
  });
  parses(key);
  assert.match(key, /insertKeyframe/);

  const audition = scriptFor("audition.audio.process", {
    operation: "favorite",
    name: "Normalize to -3 dB"
  });
  parses(audition);
  assert.match(audition, /applyFavorite/);

  const track = scriptFor("audition.audio.process", {
    operation: "track",
    trackIndex: 0,
    mute: true
  });
  parses(track);
  assert.match(track, /audioTracks/);
  assert.match(track, /tr\.mute=true/);

  const bridge = scriptFor("bridge.assets.manage", {
    operation: "rating",
    path: "C:\\assets\\shot.mov",
    rating: 5
  });
  parses(bridge);
  assert.match(bridge, /new Thumbnail/);
  assert.match(bridge, /t\.rating=5/);
});

test("Illustrator document lifecycle Bezier compound and clipping creation compile", () => {
  const open = scriptFor("illustrator.document.manage", {
    operation: "open",
    path: "C:\\art\\source.ai"
  });
  parses(open);
  assert.match(open, /app\.open\(f\)/);

  const artboard = scriptFor("illustrator.document.manage", {
    operation: "setArtboard",
    index: 0,
    rect: [0, 1080, 1080, 0],
    name: "Square",
    activate: true
  });
  parses(artboard);
  assert.match(artboard, /artboardRect/);
  assert.match(artboard, /setActiveArtboardIndex/);

  const bezier = scriptFor("illustrator.vector.create", {
    shape: "bezier",
    name: "Curve",
    points: [
      { anchor: [0, 0], rightDirection: [40, 0], smooth: true },
      { anchor: [100, 100], leftDirection: [60, 100], smooth: true }
    ],
    stroke: [255, 0, 0],
    fill: false
  });
  parses(bezier);
  assert.match(bezier, /leftDirection/);
  assert.match(bezier, /PointType\.SMOOTH/);

  const compound = scriptFor("illustrator.vector.create", {
    shape: "compound",
    name: "Ring",
    paths: [
      { points: [[0,0],[100,0],[100,100],[0,100]], closed: true },
      { points: [[25,25],[25,75],[75,75],[75,25]], closed: true }
    ]
  });
  parses(compound);
  assert.match(compound, /compoundPathItems\.add/);
  assert.match(compound, /compound\.pathItems\.add/);

  const clip = scriptFor("illustrator.vector.create", {
    shape: "clippingGroup",
    clipTarget: { name: "Mask" },
    contents: [{ name: "Photo" }]
  });
  parses(clip);
  assert.match(clip, /group\.clipped=true/);
  assert.match(clip, /PLACEATBEGINNING/);
});

test("Illustrator rich typography appearance and brush semantics compile", () => {
  const areaText = scriptFor("illustrator.text.manage", {
    operation: "create",
    mode: "area",
    text: "Headline and body",
    x: 40,
    y: 700,
    width: 420,
    height: 180,
    font: "ArialMT",
    fontSize: 28,
    justification: "center",
    ranges: [
      { start: 0, length: 8, fontSize: 42, color: [255, 0, 0], tracking: 20 }
    ]
  });
  parses(areaText);
  assert.match(areaText, /textFrames\.areaText/);
  assert.match(areaText, /paragraphAttributes\.justification/);
  assert.match(areaText, /t\.characters\[ci\]/);

  const pathText = scriptFor("illustrator.text.manage", {
    operation: "create",
    mode: "path",
    text: "Around the curve",
    points: [[0, 0], [100, 80], [240, 0]]
  });
  parses(pathText);
  assert.match(pathText, /textFrames\.pathText/);

  const appearance = scriptFor("illustrator.appearance.style", {
    target: { name: "Badge" },
    graphicStyleName: "Neon",
    blendMode: "screen",
    stroke: [255,255,255],
    strokeWidth: 3,
    strokeCap: "round",
    strokeJoin: "round",
    strokeDashes: [12, 6],
    liveEffectXml: "<LiveEffect name=\"Adobe Offset Path\"><Dict data=\"R ofst 4 \"/></LiveEffect>"
  });
  parses(appearance);
  assert.match(appearance, /graphicStyles\.getByName/);
  assert.match(appearance, /BlendModes\.SCREEN/);
  assert.match(appearance, /StrokeCap\.ROUNDENDCAP/);
  assert.match(appearance, /applyEffect/);

  const brush = scriptFor("illustrator.symbols.patterns", {
    operation: "applyBrush",
    target: { name: "Stroke" },
    brushName: "Charcoal - Feather"
  });
  parses(brush);
  assert.match(brush, /brushes\.getByName/);
  assert.match(brush, /brush\.applyTo/);
});

test("Premiere professional finishing compilers emit QE/MOGRT/caption operations", () => {
  const speed = scriptFor("premiere.timeline.edit", {
    operation: "speed",
    target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
    speed: 1.5,
    maintainPitch: true
  });
  parses(speed);
  assert.match(speed, /setSpeed/);

  const effect = scriptFor("premiere.effects.apply", {
    operation: "effect",
    target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
    name: "Gaussian Blur",
    parameters: { Blurriness: 20 }
  });
  parses(effect);
  assert.match(effect, /getVideoEffectByName/);
  assert.match(effect, /addVideoEffect/);

  const transition = scriptFor("premiere.effects.apply", {
    operation: "transition",
    target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
    name: "Cross Dissolve",
    position: "end",
    duration: 0.5
  });
  parses(transition);
  assert.match(transition, /addTransition/);

  const grade = scriptFor("premiere.color.grade", {
    target: { trackType: "video", trackIndex: 0, clipIndex: 0 },
    adjustments: { Exposure: 0.5, Saturation: 105 },
    lutPath: "C:\\looks\\show.cube"
  });
  parses(grade);
  assert.match(grade, /Lumetri Color/);

  const graphics = scriptFor("premiere.graphics.manage", {
    operation: "importMogrt",
    mogrtPath: "C:\\gfx\\lower-third.mogrt",
    time: 3,
    videoTrack: 1,
    texts: ["Gaurav", "Engineer"]
  });
  parses(graphics);
  assert.match(graphics, /importMGT/);
  assert.match(graphics, /mTextParam/);

  const captions = scriptFor("premiere.captions.manage", {
    operation: "importSrt",
    path: "C:\\captions\\final.srt",
    start: 0,
    format: "subtitle"
  });
  parses(captions);
  assert.match(captions, /createCaptionTrack/);

  const qa = scriptFor("premiere.timeline.qa", { minClipSeconds: 0.08 });
  parses(qa);
  assert.match(qa, /short_clip/);
  assert.match(qa, /gap/);
});

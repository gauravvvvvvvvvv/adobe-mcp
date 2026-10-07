export interface CapabilityGuide {
  operations?: string[];
  required?: string[];
  optional?: string[];
  example: Record<string, unknown>;
  notes?: string[];
}

const G = (
  example: Record<string, unknown>,
  options: Omit<CapabilityGuide, "example"> = {}
): CapabilityGuide => ({ ...options, example });

const GUIDES: Record<string, CapabilityGuide> = {
  "creative.runtime.limits": G(
    { host: "premiere" },
    { optional: ["host"], notes: ["Omit host to return all known API/tooling ceilings."] }
  ),
  "creative.assets.index": G(
    { paths: ["D:/project/footage"], recursive: true, maxAssets: 500, probe: true },
    { required: ["paths[]"], optional: ["recursive", "maxAssets", "hash", "probe"] }
  ),
  "creative.assets.analyze": G(
    { paths: ["D:/project/footage"], recursive: true, maxAssets: 1000, exactHash: false, nearDuplicateDistance: 5 },
    {
      required: ["paths[]"],
      optional: ["recursive", "maxAssets", "exactHash", "nearDuplicateDistance"],
      notes: ["Prefer exactHash=false for very large footage sets unless byte-identical duplicate proof is needed."]
    }
  ),
  "creative.reference.analyze": G(
    { inputPath: "D:/project/reference.mp4", outputDir: "D:/project/.adobe-mcp/reference", maxFrames: 16 },
    { required: ["inputPath", "outputDir"], optional: ["sceneThreshold", "silenceDb", "silenceMinSeconds", "maxFrames", "proxyWidth"] }
  ),
  "creative.recipe.list": G({}, { notes: ["No parameters required."] }),
  "creative.recipe.expand": G(
    { recipeId: "premiere.master-edit", input: { clips: [{ path: "D:/media/a.mp4", sourceIn: 0, sourceOut: 4 }] } },
    { required: ["recipeId"], optional: ["input"] }
  ),
  "creative.editspec.validate": G(
    { spec: { version: 1, title: "Edit", prompt: "Create a polished cut.", deliverables: [], acceptanceCriteria: [], operations: [], review: { required: true } } },
    { required: ["spec"] }
  ),
  "creative.job.create": G(
    { spec: { version: 1, title: "Edit", prompt: "Create a polished cut.", deliverables: [], acceptanceCriteria: [], operations: [], review: { required: true } } },
    { required: ["spec"], notes: ["Validate with creative.editspec.validate first for complex jobs."] }
  ),
  "creative.job.get": G(
    { jobId: "JOB_ID", full: false },
    { required: ["jobId"], optional: ["full"] }
  ),
  "creative.job.update": G(
    { jobId: "JOB_ID", note: "Repair pass 2 after visual review." },
    { required: ["jobId"], optional: ["spec", "note"], notes: ["Replacing spec increments job revision and resets operation results."] }
  ),
  "creative.job.run": G(
    { jobId: "JOB_ID", checkpoint: true, checkpointRequired: true, stopOnError: true },
    {
      required: ["jobId"],
      optional: ["checkpoint", "checkpointRequired", "stopOnError", "fromOperationId", "rerunSuccessful", "resumeUnknown"],
      notes: ["Do not use resumeUnknown=true until the host/project has been inspected after an interrupted operation."]
    }
  ),
  "creative.job.review": G(
    {
      jobId: "JOB_ID",
      verdict: "pass",
      notes: "Reviewed rendered proxy/contact sheet and technical validation.",
      criteria: [{ id: "timeline", verdict: "pass", note: "No visible gaps or bad cuts." }],
      artifacts: ["D:/review/contact-sheet.jpg"]
    },
    {
      required: ["jobId", "verdict", "criteria[]"],
      optional: ["notes", "artifacts[]"],
      notes: ["A passing review requires explicit verdicts for every required criterion and required review artifacts."]
    }
  ),
  "creative.preview.generate": G(
    { jobId: "JOB_ID", inputPath: "D:/out/master.mp4", outputDir: "D:/review", proxyWidth: 1280, contactFrames: 20, includeWaveform: true },
    { required: ["inputPath", "outputDir"], optional: ["jobId", "proxyWidth", "contactFrames", "includeWaveform"] }
  ),
  "creative.output.validate": G(
    { jobId: "JOB_ID", path: "D:/out/master.mp4", expected: { width: 1920, height: 1080, fps: 30, audioRequired: true }, register: true },
    { required: ["path"], optional: ["jobId", "expected", "register", "kind"] }
  ),
  "creative.repair.plan": G(
    { jobId: "JOB_ID", validation: { ok: false, issues: ["width mismatch"] } },
    { optional: ["jobId", "criteria", "reviewCriteria", "notes", "validation"], notes: ["With jobId, the latest persisted review is used."] }
  ),

  "premiere.project.manage": G(
    { operation: "import", paths: ["D:/media/a.mp4", "D:/media/b.wav"] },
    {
      required: ["operation"],
      optional: ["path", "paths", "name", "parentBinName", "sequence", "presetPath", "save"],
      operations: ["open", "new", "close", "save", "saveAs", "import", "createBin", "activateSequence", "createSequence"]
    }
  ),
  "premiere.timeline.assemble": G(
    {
      sequence: "Main",
      clear: false,
      startAt: 0,
      clips: [
        { path: "D:/media/a.mp4", sourceIn: 1.2, sourceOut: 4.8, at: 0, videoTrack: 0, audioTrack: 0, mode: "insert", linkAudio: true }
      ]
    },
    { required: ["clips[]"], optional: ["sequence", "clear", "startAt"] }
  ),
  "premiere.timeline.edit": G(
    { operation: "extract", sequence: "Main", start: 12, end: 15.5, allTracks: true, fps: 30 },
    {
      required: ["operation"],
      optional: ["sequence", "target", "time", "start", "end", "tracks", "allTracks", "fps", "sourceIn", "sourceOut", "duration", "speed", "reverse", "maintainPitch", "ripple", "enabled"],
      operations: ["move", "delete", "trim", "razor", "lift", "extract", "speed", "setEnabled"],
      notes: ["Clip targets normally use {trackType, trackIndex, clipIndex|nodeId|name|startSeconds}."]
    }
  ),
  "premiere.timeline.qa": G(
    { sequence: "Main", minClipSeconds: 0.08, gapToleranceSeconds: 0.001 },
    { optional: ["sequence", "minClipSeconds", "gapToleranceSeconds"] }
  ),
  "premiere.motion.animate": G(
    {
      target: { trackIndex: 0, clipIndex: 0 },
      keyframes: [{ time: 0, property: "Scale", value: 100 }, { time: 1, property: "Scale", value: 115 }],
      crop: { left: 2, right: 2 },
      timeRemap: [{ time: 0, speedPercent: 100 }, { time: 1, speedPercent: 200 }]
    },
    { required: ["target"], optional: ["sequence", "keyframes", "crop", "cropKeyframes", "timeRemap"] }
  ),
  "premiere.effects.apply": G(
    { operation: "effect", target: { trackIndex: 0, clipIndex: 0 }, name: "Gaussian Blur", parameters: { Blurriness: 12 } },
    { required: ["operation", "target", "name"], optional: ["sequence", "parameters", "position", "duration"], operations: ["effect", "transition"] }
  ),
  "premiere.color.grade": G(
    { operation: "apply", target: { trackIndex: 0, clipIndex: 0 }, adjustments: { Exposure: 0.4, Contrast: 10 }, lutPath: "D:/looks/show.cube" },
    { required: ["target"], optional: ["operation", "sequence", "adjustments", "lutPath"], operations: ["apply", "inspect"] }
  ),
  "premiere.audio.mix": G(
    {
      target: { trackIndex: 0, clipIndex: 0 },
      levelDb: -4,
      pan: 0,
      baseDb: -4,
      fadeSeconds: 0.2,
      duckingWindows: [{ start: 2, end: 5, db: -18 }]
    },
    { optional: ["operation", "sequence", "target", "trackIndex", "muted", "levelDb", "pan", "keyframes", "baseDb", "fadeSeconds", "duckingWindows"], operations: ["clip", "trackMute"] }
  ),
  "premiere.captions.manage": G(
    { operation: "importSrt", sequence: "Main", path: "D:/captions/subtitles.srt", start: 0, format: "subtitle" },
    { required: ["path"], optional: ["operation", "sequence", "start", "format"], operations: ["importSrt"] }
  ),
  "premiere.graphics.manage": G(
    { operation: "importMogrt", sequence: "Main", mogrtPath: "D:/graphics/lower-third.mogrt", time: 4, videoTrack: 2, properties: { "Accent Color": 1 }, texts: ["Speaker", "Role"] },
    { required: ["operation"], optional: ["sequence", "mogrtPath", "time", "videoTrack", "audioTrack", "properties", "texts", "target"], operations: ["importMogrt", "inspect"] }
  ),
  "premiere.export.render": G(
    { sequence: "Main", outputPath: "D:/out/master.mp4", presetPath: "D:/presets/H264.epr", startImmediately: true },
    { required: ["outputPath", "presetPath"], optional: ["sequence", "startImmediately"] }
  ),

  "after-effects.composition.manage": G(
    { operation: "create", name: "Main", width: 1920, height: 1080, duration: 10, frameRate: 30 },
    { required: ["operation"], optional: ["composition", "name", "width", "height", "pixelAspect", "duration", "frameRate", "workAreaStart", "workAreaDuration", "motionBlur", "shutterAngle", "layerIndices"], operations: ["create", "configure", "duplicate", "precompose"] }
  ),
  "after-effects.layers.manage": G(
    { operation: "footage", composition: "Main", path: "D:/media/plate.mov", name: "Plate", threeDLayer: false },
    { required: ["operation"], optional: ["composition", "path", "text", "name", "color", "width", "height", "center", "target", "position", "threeDLayer", "parent", "moveBefore", "moveAfter"], operations: ["footage", "text", "solid", "null", "shape", "camera", "light", "duplicate", "remove"] }
  ),
  "after-effects.properties.animate": G(
    {
      composition: "Main",
      target: { name: "Logo" },
      keyframes: [
        { time: 0, path: ["ADBE Transform Group", "ADBE Scale"], value: [80, 80], interpolation: "bezier" },
        { time: 0.6, path: ["ADBE Transform Group", "ADBE Scale"], value: [100, 100], interpolation: "bezier" }
      ]
    },
    { required: ["target", "keyframes[]"], optional: ["composition", "expression"] }
  ),
  "after-effects.text.animate": G(
    { composition: "Main", text: "LAUNCH", name: "Title", position: [960, 540], fontSize: 120, duration: 3, animator: { opacity: 0, position: [0, 80, 0], selectorKeyframes: [{ time: 0, offset: -100 }, { time: 1, offset: 100 }] } },
    { required: ["text"], optional: ["composition", "name", "position", "fontSize", "color", "start", "duration", "animateIn", "animator"] }
  ),
  "after-effects.shapes.draw": G(
    { composition: "Main", shape: "path", name: "Line", vertices: [[0, 0], [200, -80], [400, 0]], stroke: [1, 1, 1], strokeWidth: 6, fill: false },
    { required: ["shape"], optional: ["composition", "name", "position", "size", "vertices", "inTangents", "outTangents", "closed", "fill", "stroke", "strokeWidth", "trim", "repeater"] }
  ),
  "after-effects.masks.mattes": G(
    { operation: "mask", composition: "Main", target: { name: "Plate" }, vertices: [[0, 0], [300, 0], [300, 200], [0, 200]], feather: [10, 10] },
    { required: ["operation", "target"], optional: ["composition", "vertices", "inTangents", "outTangents", "closed", "name", "mode", "feather", "opacity", "expansion", "matte", "type", "blendMode"], operations: ["mask", "trackMatte", "removeTrackMatte", "blendMode"] }
  ),
  "after-effects.effects.apply": G(
    { operation: "effect", composition: "Main", target: { name: "Plate" }, name: "ADBE Gaussian Blur 2", parameters: { Blurriness: 20 } },
    { required: ["operation", "target"], optional: ["composition", "name", "parameters", "path"], operations: ["effect", "preset", "remove"] }
  ),
  "after-effects.three-d.scene": G(
    { operation: "configure", composition: "Main", target: { name: "Card" }, position: [960, 540, -500], yRotation: 10, motionBlur: true },
    { required: ["operation"], optional: ["composition", "target", "enabled", "position", "orientation", "xRotation", "yRotation", "zRotation", "parent", "motionBlur", "name", "center", "zoom", "intensity"], operations: ["configure", "camera", "light", "parent"] }
  ),
  "after-effects.render.queue": G(
    { operation: "add", composition: "Main", outputPath: "D:/out/comp.mov", renderSettingsTemplate: "Best Settings", outputModuleTemplate: "Lossless", start: false },
    { required: ["operation"], optional: ["composition", "outputPath", "renderSettingsTemplate", "outputModuleTemplate", "start", "itemIndex", "paused"], operations: ["inspect", "add", "set", "remove", "render", "pause", "stop"] }
  ),

  "photoshop.document.manage": G(
    { operation: "create", name: "Poster", width: 1920, height: 1080, resolution: 144 },
    { required: ["operation"], optional: ["name", "width", "height", "resolution", "path", "bounds", "angle", "mergeLayersOnly"], operations: ["create", "open", "resize", "crop", "duplicate", "save"] }
  ),
  "photoshop.layers.manage": G(
    { operation: "create", kind: "pixel", name: "Retouch", opacity: 100 },
    { required: ["operation"], optional: ["kind", "name", "contents", "fontName", "fontSize", "opacity", "visible", "angle", "width", "height", "deltaX", "deltaY", "blendMode", "enabled", "fromSelection"], operations: ["create", "rename", "opacity", "visibility", "duplicate", "delete", "rotate", "scale", "translate", "skew", "flip", "front", "back", "blendMode", "clippingMask", "groupSelected"] }
  ),
  "photoshop.text.manage": G(
    { operation: "styleRanges", ranges: [{ from: 0, to: 5, font: "Arial-BoldMT", fontSize: 72, color: [255, 80, 50] }, { from: 5, to: 10, fontSize: 72, color: [255, 255, 255] }] },
    { required: ["operation"], optional: ["text", "name", "fontName", "fontSize", "position", "opacity", "font", "tracking", "leading", "autoLeading", "baselineShift", "horizontalScale", "verticalScale", "fauxBold", "fauxItalic", "color", "justification", "hyphenation", "firstLineIndent", "leftIndent", "rightIndent", "spaceBefore", "spaceAfter", "paragraph", "point", "ranges"], operations: ["create", "setText", "setSize", "style", "styleRanges"] }
  ),
  "photoshop.selection.mask": G(
    { operation: "subject" },
    { required: ["operation"], optional: ["mode", "bounds", "feather", "antiAlias", "by", "tolerance", "radius", "deltaX", "deltaY", "widthPercent", "heightPercent", "angle", "anchor", "pathName"], operations: ["selectAll", "deselect", "inverse", "rectangle", "ellipse", "contract", "expand", "feather", "grow", "smooth", "translateBoundary", "resizeBoundary", "rotateBoundary", "makeWorkPath", "subject", "maskFromSelection"] }
  ),
  "photoshop.paint.retouched": G(
    { operation: "contentAwareFill", duplicateBefore: true },
    { required: ["operation"], optional: ["duplicateBefore", "points", "source", "tool", "simulatePressure"], operations: ["contentAwareFill", "clone", "heal"] }
  ),
  "photoshop.adjustments.apply": G(
    { operation: "createLayer", kind: "exposure", name: "Exposure", parameters: { exposure: 0.4, offset: 0, gammaCorrection: 1 } },
    { required: ["operation"], optional: ["kind", "name", "opacity", "blendMode", "parameters", "brightness", "contrast", "inputRangeStart", "inputRangeEnd", "inputGamma", "outputRangeStart", "outputRangeEnd", "hue", "saturation", "lightness", "exposure", "offset", "gammaCorrection", "vibrance", "descriptors"], operations: ["createLayer", "setLayer", "brightnessContrast", "levels", "hueSaturation", "invert"] }
  ),
  "photoshop.smart-objects.manage": G(
    { operation: "replaceContents", path: "D:/assets/product.png" },
    { required: ["operation"], optional: ["path", "all"], operations: ["convert", "replaceContents", "relink", "editContents", "updateModified"] }
  ),
  "photoshop.export.assets": G(
    { path: "D:/out/poster.png", format: "png" },
    { required: ["path"], optional: ["format", "quality", "asCopy"] }
  ),

  "illustrator.document.manage": G(
    { operation: "create", name: "Brand", width: 1920, height: 1080 },
    { required: ["operation"], optional: ["name", "width", "height", "path", "rect", "artboardIndex", "artboardName", "save"], operations: ["create", "open", "save", "saveAs", "close", "listArtboards", "addArtboard", "configureArtboard", "activateArtboard", "removeArtboard"] }
  ),
  "illustrator.vector.create": G(
    { shape: "path", name: "Mark", points: [[0, 0], [120, 180], [240, 0]], closed: true, fill: [20, 20, 20] },
    { required: ["shape"], optional: ["name", "x", "y", "width", "height", "centerX", "centerY", "radius", "sides", "points", "inTangents", "outTangents", "closed", "fill", "stroke", "strokeWidth", "targets", "clippingTarget"] }
  ),
  "illustrator.vector.transform": G(
    { operation: "align", targets: [{ name: "Mark" }, { name: "Wordmark" }], mode: "hCenter", reference: "artboard" },
    { required: ["operation"], optional: ["target", "targets", "dx", "dy", "degrees", "xPercent", "yPercent", "strokePercent", "mode", "reference", "spacing"], operations: ["move", "rotate", "scale", "front", "back", "align", "distribute"] }
  ),
  "illustrator.appearance.style": G(
    { target: { name: "Mark" }, gradient: { type: "linear", angle: 45, stops: [{ rampPoint: 0, color: [255, 80, 50] }, { rampPoint: 100, color: [80, 50, 255] }] } },
    { required: ["target"], optional: ["fill", "stroke", "strokeWidth", "opacity", "blendMode", "gradient", "patternName", "graphicStyle", "liveEffectXml", "dashArray", "strokeCap", "strokeJoin"] }
  ),
  "illustrator.text.manage": G(
    { operation: "createPoint", text: "NOVA", name: "Wordmark", x: 200, y: 500, fontSize: 96, color: [20, 20, 20] },
    { required: ["operation"], optional: ["text", "name", "x", "y", "width", "height", "pathTarget", "font", "fontSize", "color", "tracking", "leading", "horizontalScale", "verticalScale", "baselineShift", "stroke", "strokeWidth", "justification", "ranges", "target"], operations: ["createPoint", "createArea", "createPath", "update"] }
  ),
  "illustrator.export.assets": G(
    { path: "D:/out/logo.svg", format: "svg" },
    { required: ["path"], optional: ["format", "transparency", "quality", "preserveEditability", "pdfPreset"] }
  )
};

export function getCapabilityGuide(id: string): CapabilityGuide | undefined {
  return GUIDES[id];
}

export function capabilityGuideIds(): string[] {
  return Object.keys(GUIDES);
}

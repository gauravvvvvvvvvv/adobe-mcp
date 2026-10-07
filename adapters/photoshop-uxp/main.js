const { entrypoints, storage } = require("uxp");
const photoshop = require("photoshop");
const { app, action, core, constants } = photoshop;
const fs = storage.localFileSystem;

const WS_URL = "ws://127.0.0.1:38470";
const CAPABILITIES = [
  "photoshop.context.inspect",
  "photoshop.document.manage",
  "photoshop.layers.manage",
  "photoshop.selection.mask",
  "photoshop.paint.retouched",
  "photoshop.adjustments.apply",
  "photoshop.filters.apply",
  "photoshop.smart-objects.manage",
  "photoshop.text.manage",
  "photoshop.paths.vector",
  "photoshop.export.assets"
];

let socket = null;
let reconnectTimer = null;
let retryMs = 250;
let stopped = false;

function setStatus(text, connected) {
  const status = document.getElementById("status");
  const dot = document.getElementById("dot");
  if (status) status.textContent = text;
  if (dot) dot.style.background = connected ? "#43b581" : "#777";
}

function send(message) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function compactLayer(layer) {
  return {
    id: layer.id,
    name: layer.name,
    kind: String(layer.kind ?? ""),
    visible: layer.visible,
    opacity: layer.opacity,
    bounds: layer.bounds ? {
      left: Number(layer.bounds.left),
      top: Number(layer.bounds.top),
      right: Number(layer.bounds.right),
      bottom: Number(layer.bounds.bottom)
    } : undefined
  };
}

async function inspectContext() {
  const documents = app.documents ?? [];
  if (!documents.length) return { documents: 0, activeDocument: null };
  const doc = app.activeDocument;
  const selected = (doc.activeLayers ?? []).slice(0, 50).map(compactLayer);
  const topLayers = (doc.layers ?? []).slice(0, 100).map(compactLayer);
  return {
    documents: documents.length,
    activeDocument: {
      id: doc.id,
      title: doc.title,
      width: Number(doc.width),
      height: Number(doc.height),
      resolution: Number(doc.resolution),
      selectedLayers: selected,
      topLayers,
      topLayerCount: doc.layers?.length ?? 0
    }
  };
}

function requireDocument() {
  if (!app.documents || !app.documents.length) throw new Error("No active Photoshop document");
  return app.activeDocument;
}

function selectedLayer() {
  const doc = requireDocument();
  const layers = doc.activeLayers ?? [];
  if (!layers.length) throw new Error("No selected Photoshop layer");
  return layers[0];
}

function rgbColor(value) {
  if (!Array.isArray(value) || value.length < 3) throw new Error("RGB color must be [r,g,b]");
  const SolidColor = app.SolidColor;
  const color = new SolidColor();
  color.rgb.red = Math.max(0, Math.min(255, numeric(value[0])));
  color.rgb.green = Math.max(0, Math.min(255, numeric(value[1])));
  color.rgb.blue = Math.max(0, Math.min(255, numeric(value[2])));
  return color;
}

function adjustmentKind(name) {
  const key = String(name || "").replace(/[^A-Za-z]/g, "").toUpperCase();
  const map = {
    BRIGHTNESSCONTRAST: "BRIGHTNESSCONTRAST",
    LEVELS: "LEVELS",
    CURVES: "CURVES",
    EXPOSURE: "EXPOSURE",
    VIBRANCE: "VIBRANCE",
    HUESATURATION: "HUESATURATION",
    COLORBALANCE: "COLORBALANCE",
    BLACKANDWHITE: "BLACKANDWHITE",
    PHOTOFILTER: "PHOTOFILTER",
    CHANNELMIXER: "CHANNELMIXER",
    COLORLOOKUP: "COLORLOOKUP",
    GRADIENTMAP: "GRADIENTMAP",
    SELECTIVECOLOR: "SELECTIVECOLOR",
    POSTERIZE: "POSTERIZE",
    THRESHOLD: "THRESHOLD",
    INVERSION: "INVERSION",
    CLARITY: "CLARITY",
    GRAIN: "GRAIN"
  };
  const constantName = map[key];
  if (!constantName || !constants.LayerKind[constantName]) throw new Error("Unsupported adjustment kind: " + name);
  return constants.LayerKind[constantName];
}

function normalizeFileUrl(path) {
  if (typeof path !== "string" || !path.trim()) throw new Error("path is required");
  const normalized = path.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) return "file:/" + normalized;
  if (normalized.startsWith("/")) return "file:" + normalized;
  if (normalized.startsWith("file:/")) return normalized;
  throw new Error("An absolute filesystem path is required");
}

async function existingEntry(path) {
  return fs.getEntryWithUrl(normalizeFileUrl(path));
}

async function writableEntry(path) {
  return fs.createEntryWithUrl(normalizeFileUrl(path), { overwrite: true });
}

function numeric(value, fallback) {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  if (fallback !== undefined) return fallback;
  throw new Error("numeric value required");
}

function bounds(value) {
  if (!value || typeof value !== "object") throw new Error("bounds object is required");
  return {
    left: numeric(value.left),
    top: numeric(value.top),
    right: numeric(value.right),
    bottom: numeric(value.bottom)
  };
}

async function runModal(name, fn) {
  return core.executeAsModal(fn, { commandName: "Adobe MCP: " + name });
}

async function manageDocument(params) {
  const operation = params.operation;
  if (operation === "create") {
    return runModal("create document", async () => {
      const doc = await app.createDocument({
        name: typeof params.name === "string" ? params.name : "Adobe MCP",
        width: numeric(params.width, 1920),
        height: numeric(params.height, 1080),
        resolution: numeric(params.resolution, 72)
      });
      return { id: doc.id, title: doc.title, width: Number(doc.width), height: Number(doc.height) };
    });
  }
  if (operation === "open") {
    const entry = await existingEntry(params.path);
    return runModal("open document", async () => {
      const doc = await app.open(entry);
      return { id: doc.id, title: doc.title, width: Number(doc.width), height: Number(doc.height) };
    });
  }
  if (operation === "resize") {
    return runModal("resize image", async () => {
      const doc = requireDocument();
      await doc.resizeImage(
        params.width === undefined ? undefined : numeric(params.width),
        params.height === undefined ? undefined : numeric(params.height),
        params.resolution === undefined ? undefined : numeric(params.resolution)
      );
      return { id: doc.id, width: Number(doc.width), height: Number(doc.height), resolution: Number(doc.resolution) };
    });
  }
  if (operation === "crop") {
    return runModal("crop document", async () => {
      const doc = requireDocument();
      await doc.crop(bounds(params.bounds), numeric(params.angle, 0));
      return { id: doc.id, width: Number(doc.width), height: Number(doc.height) };
    });
  }
  if (operation === "duplicate") {
    return runModal("duplicate document", async () => {
      const doc = requireDocument();
      const copy = await doc.duplicate(typeof params.name === "string" ? params.name : undefined, params.mergeLayersOnly === true);
      return { id: copy.id, title: copy.title };
    });
  }
  if (operation === "save") {
    return runModal("save document", async () => {
      const doc = requireDocument();
      await doc.save();
      return { id: doc.id, title: doc.title, saved: true };
    });
  }
  throw new Error("Supported document operations: create, open, resize, crop, duplicate, save");
}

async function manageLayer(params) {
  const operation = params.operation;
  return runModal("layer edit", async () => {
    const doc = requireDocument();

    if (operation === "create") {
      const kind = String(params.kind || "pixel");
      let layer;
      if (kind === "group") {
        layer = await doc.createLayerGroup({
          name: typeof params.name === "string" ? params.name : "Group",
          opacity: numeric(params.opacity, 100),
          fromLayers: params.fromSelection === true ? doc.activeLayers : undefined
        });
      } else if (kind === "text") {
        layer = await doc.createTextLayer({
          name: typeof params.name === "string" ? params.name : "Text",
          contents: typeof params.contents === "string" ? params.contents : "Text",
          fontName: typeof params.fontName === "string" ? params.fontName : undefined,
          fontSize: numeric(params.fontSize, 48),
          position: params.position && typeof params.position === "object"
            ? { x: numeric(params.position.x), y: numeric(params.position.y) }
            : undefined,
          opacity: numeric(params.opacity, 100)
        });
      } else {
        layer = await doc.createPixelLayer({
          name: typeof params.name === "string" ? params.name : "Layer",
          opacity: numeric(params.opacity, 100),
          fillNeutral: params.fillNeutral === true
        });
      }
      return compactLayer(layer);
    }

    const layer = selectedLayer();

    if (operation === "rename") {
      if (typeof params.name !== "string" || !params.name) throw new Error("name is required");
      layer.name = params.name;
    } else if (operation === "opacity") {
      const value = numeric(params.value);
      if (value < 0 || value > 100) throw new Error("value must be 0..100");
      layer.opacity = value;
    } else if (operation === "visibility") {
      layer.visible = Boolean(params.visible);
    } else if (operation === "duplicate") {
      const copy = await layer.duplicate(undefined, undefined, typeof params.name === "string" ? params.name : undefined);
      return compactLayer(copy);
    } else if (operation === "delete") {
      const old = compactLayer(layer);
      layer.delete();
      return { deleted: old };
    } else if (operation === "rotate") {
      await layer.rotate(numeric(params.degrees, 0));
    } else if (operation === "scale") {
      const x = numeric(params.xPercent, 100);
      const y = numeric(params.yPercent, x);
      await layer.scale(x, y);
    } else if (operation === "translate") {
      await layer.translate(numeric(params.x, 0), numeric(params.y, 0));
    } else if (operation === "skew") {
      await layer.skew(numeric(params.horizontal, 0), numeric(params.vertical, 0));
    } else if (operation === "flip") {
      const axis = String(params.axis || "horizontal").toLowerCase();
      const value = axis === "vertical" ? constants.FlipAxis.VERTICAL : axis === "both" ? constants.FlipAxis.BOTH : constants.FlipAxis.HORIZONTAL;
      await layer.flip(value);
    } else if (operation === "front") {
      layer.bringToFront();
    } else if (operation === "back") {
      layer.sendToBack();
    } else if (operation === "blendMode") {
      const mode = String(params.mode || "NORMAL").replace(/[^A-Za-z]/g, "").toUpperCase();
      if (!constants.BlendMode[mode]) throw new Error("Unknown Photoshop blend mode: " + params.mode);
      layer.blendMode = constants.BlendMode[mode];
    } else if (operation === "clippingMask") {
      layer.isClippingMask = params.enabled !== false;
    } else if (operation === "groupSelected") {
      const group = await doc.groupLayers(doc.activeLayers);
      if (typeof params.name === "string") group.name = params.name;
      return compactLayer(group);
    } else {
      throw new Error("Supported layer operations: create, rename, opacity, visibility, duplicate, delete, rotate, scale, translate, skew, flip, front, back, blendMode, clippingMask, groupSelected");
    }

    return compactLayer(layer);
  });
}

async function manageText(params) {
  return runModal("text edit", async () => {
    const doc = requireDocument();
    let layer;

    if (params.operation === "create" || params.operation === undefined) {
      layer = await doc.createTextLayer({
        name: typeof params.name === "string" ? params.name : "Text",
        contents: typeof params.text === "string" ? params.text : "",
        fontName: typeof params.fontName === "string" ? params.fontName : undefined,
        fontSize: numeric(params.fontSize, 48),
        position: params.position && typeof params.position === "object"
          ? { x: numeric(params.position.x), y: numeric(params.position.y) }
          : undefined,
        opacity: numeric(params.opacity, 100)
      });
    } else {
      layer = selectedLayer();
      if (!layer.textItem) throw new Error("Selected layer is not a text layer");
      if (params.operation === "setText") {
        if (typeof params.text !== "string") throw new Error("text is required");
        layer.textItem.contents = params.text;
      } else if (params.operation === "setSize") {
        layer.textItem.characterStyle.size = numeric(params.fontSize);
      } else if (params.operation !== "style") {
        throw new Error("Supported text operations: create, setText, setSize, style");
      }
    }

    const item = layer.textItem;
    if (!item) return compactLayer(layer);
    const cs = item.characterStyle;
    const ps = item.paragraphStyle;

    if (typeof params.font === "string") cs.font = params.font;
    if (params.fontSize !== undefined) cs.size = numeric(params.fontSize);
    if (params.tracking !== undefined) cs.tracking = numeric(params.tracking);
    if (params.leading !== undefined) { cs.useAutoLeading = false; cs.leading = numeric(params.leading); }
    if (params.autoLeading === true) cs.useAutoLeading = true;
    if (params.baselineShift !== undefined) cs.baselineShift = numeric(params.baselineShift);
    if (params.horizontalScale !== undefined) cs.horizontalScale = numeric(params.horizontalScale);
    if (params.verticalScale !== undefined) cs.verticalScale = numeric(params.verticalScale);
    if (params.fauxBold !== undefined) cs.fauxBold = params.fauxBold === true;
    if (params.fauxItalic !== undefined) cs.fauxItalic = params.fauxItalic === true;
    if (Array.isArray(params.color)) cs.color = rgbColor(params.color);

    if (typeof params.justification === "string") {
      const key = params.justification.replace(/[^A-Za-z]/g, "").toUpperCase();
      if (!constants.Justification[key]) throw new Error("Unknown justification: " + params.justification);
      ps.justification = constants.Justification[key];
    }
    if (params.hyphenation !== undefined) ps.hyphenation = params.hyphenation === true;
    if (params.firstLineIndent !== undefined) ps.firstLineIndent = numeric(params.firstLineIndent);
    if (params.leftIndent !== undefined) ps.leftIndent = numeric(params.leftIndent);
    if (params.rightIndent !== undefined) ps.rightIndent = numeric(params.rightIndent);
    if (params.spaceBefore !== undefined) ps.spaceBefore = numeric(params.spaceBefore);
    if (params.spaceAfter !== undefined) ps.spaceAfter = numeric(params.spaceAfter);

    if (params.paragraph === true && item.isPointText && item.convertToParagraphText) {
      await item.convertToParagraphText();
    }
    if (params.point === true && item.isParagraphText && item.convertToPointText) {
      await item.convertToPointText();
    }

    return {
      ...compactLayer(layer),
      text: item.contents,
      characterStyle: {
        size: cs.size,
        font: cs.font,
        tracking: cs.tracking,
        leading: cs.leading,
        horizontalScale: cs.horizontalScale,
        verticalScale: cs.verticalScale
      }
    };
  });
}

async function manageSelection(params) {
  return runModal("selection", async () => {
    const doc = requireDocument();
    const selection = doc.selection;
    const operation = params.operation;

    if (operation === "selectAll") {
      if (!selection.selectAll) throw new Error("Selection DOM requires Photoshop 25+");
      await selection.selectAll();
    } else if (operation === "deselect") {
      if (!selection.deselect) {
        await action.batchPlay([{ _obj: "set", _target: [{ _ref: "channel", _property: "selection" }], to: { _enum: "ordinal", _value: "none" } }], {});
      } else await selection.deselect();
    } else if (operation === "inverse") {
      if (!selection.inverse) throw new Error("Selection DOM requires Photoshop 25+");
      await selection.inverse();
    } else if (operation === "rectangle") {
      if (!selection.selectRectangle) throw new Error("Selection DOM requires Photoshop 25+");
      await selection.selectRectangle(bounds(params.bounds), constants.SelectionType.REPLACE);
    } else if (operation === "ellipse") {
      if (!selection.selectEllipse) throw new Error("Selection DOM requires Photoshop 25+");
      await selection.selectEllipse(bounds(params.bounds), constants.SelectionType.REPLACE);
    } else if (operation === "subject") {
      await action.batchPlay([{
        _obj: "autoCutout",
        sampleAllLayers: params.sampleAllLayers === true,
        _options: { dialogOptions: "silent" }
      }], {});
    } else if (operation === "maskFromSelection") {
      await action.batchPlay([{
        _obj: "make",
        new: { _class: "channel" },
        at: { _ref: "channel", _enum: "channel", _value: "mask" },
        using: { _enum: "userMaskEnabled", _value: params.reveal === false ? "hideSelection" : "revealSelection" },
        _options: { dialogOptions: "silent" }
      }], {});
    } else {
      throw new Error("Supported selection operations: selectAll, deselect, inverse, rectangle, ellipse, subject, maskFromSelection");
    }

    return { operation, bounds: selection.bounds ?? null };
  });
}

async function paintRetouch(params) {
  return runModal("retouch", async () => {
    const doc = requireDocument();
    const operation = String(params.operation || "contentAwareFill");
    let layer = selectedLayer();

    if (params.duplicateBefore === true) {
      layer = await layer.duplicate();
      if (typeof params.layerName === "string" && params.layerName) layer.name = params.layerName;
    }

    if (operation === "contentAwareFill") {
      const selection = doc.selection;
      if (params.bounds) {
        if (!selection.selectRectangle) throw new Error("Selection DOM requires Photoshop 25+ for typed content-aware bounds");
        await selection.selectRectangle(bounds(params.bounds), constants.SelectionType.REPLACE);
      }
      if (params.expand !== undefined) {
        if (!selection.expand) throw new Error("Selection expand requires Photoshop 25+");
        await selection.expand(Math.max(0, numeric(params.expand)));
      }
      if (params.feather !== undefined) {
        if (!selection.feather) throw new Error("Selection feather requires Photoshop 25+");
        await selection.feather(Math.max(0, numeric(params.feather)));
      }

      const opacity = Math.max(0, Math.min(100, numeric(params.opacity, 100)));
      const result = await action.batchPlay([{
        _obj: "fill",
        using: { _enum: "fillContents", _value: "contentAware" },
        opacity: { _unit: "percentUnit", _value: opacity },
        mode: { _enum: "blendMode", _value: "normal" },
        _options: { dialogOptions: "silent" }
      }], { synchronousExecution: false, modalBehavior: "execute" });

      if (params.deselect !== false) {
        if (selection.deselect) await selection.deselect();
        else await action.batchPlay([{
          _obj: "set",
          _target: [{ _ref: "channel", _property: "selection" }],
          to: { _enum: "ordinal", _value: "none" },
          _options: { dialogOptions: "silent" }
        }], {});
      }
      return { operation, layer: compactLayer(layer), opacity, result };
    }

    if (operation === "clone" || operation === "heal") {
      if (!Array.isArray(params.points) || params.points.length < 2) {
        throw new Error("clone/heal requires points with at least two anchors");
      }
      const source = params.sourceOrigin;
      if (!source || typeof source !== "object") throw new Error("clone/heal requires sourceOrigin {x,y}");

      const PathPointInfo = app.PathPointInfo || photoshop.PathPointInfo;
      const SubPathInfo = app.SubPathInfo || photoshop.SubPathInfo;
      if (!PathPointInfo || !SubPathInfo) throw new Error("Photoshop path constructors unavailable");

      const pointInfos = params.points.map((point) => {
        const anchor = Array.isArray(point)
          ? [numeric(point[0]), numeric(point[1])]
          : [numeric(point.x), numeric(point.y)];
        const left = !Array.isArray(point) && Array.isArray(point.leftDirection)
          ? [numeric(point.leftDirection[0]), numeric(point.leftDirection[1])]
          : anchor;
        const right = !Array.isArray(point) && Array.isArray(point.rightDirection)
          ? [numeric(point.rightDirection[0]), numeric(point.rightDirection[1])]
          : anchor;
        const item = new PathPointInfo();
        item.anchor = anchor;
        item.leftDirection = left;
        item.rightDirection = right;
        item.kind = (!Array.isArray(point) && point.smooth === true)
          ? constants.PointKind.SMOOTHPOINT
          : constants.PointKind.CORNERPOINT;
        return item;
      });

      const subPath = new SubPathInfo();
      subPath.closed = params.closed === true;
      subPath.operation = constants.ShapeOperation.SHAPEXOR;
      subPath.entireSubPath = pointInfos;

      const path = doc.pathItems.add(
        typeof params.pathName === "string" ? params.pathName : "Adobe MCP Retouch",
        [subPath]
      );
      try {
        const tool = operation === "clone" ? constants.ToolType.CLONESTAMP : constants.ToolType.HEALINGBRUSH;
        const sourceOrigin = { x: numeric(source.x), y: numeric(source.y) };
        await path.strokePath(tool, params.simulatePressure === true, sourceOrigin);
      } finally {
        try { await path.remove(); } catch {}
      }
      return {
        operation,
        layer: compactLayer(layer),
        points: pointInfos.length,
        sourceOrigin: { x: numeric(source.x), y: numeric(source.y) },
        simulatePressure: params.simulatePressure === true
      };
    }

    throw new Error("Supported retouch operations: contentAwareFill, clone, heal");
  });
}

async function applyAdjustment(params) {
  return runModal("adjustment", async () => {
    const doc = requireDocument();
    const operation = params.operation;

    if (operation === "createLayer") {
      const kind = adjustmentKind(params.kind);
      const layer = await doc.createLayer(kind, {
        name: typeof params.name === "string" ? params.name : String(params.kind || "Adjustment"),
        opacity: numeric(params.opacity, 100)
      });
      if (typeof params.blendMode === "string") {
        const key = params.blendMode.replace(/[^A-Za-z]/g, "").toUpperCase();
        if (!constants.BlendMode[key]) throw new Error("Unknown Photoshop blend mode: " + params.blendMode);
        layer.blendMode = constants.BlendMode[key];
      }
      return { ...compactLayer(layer), adjustmentKind: String(params.kind) };
    }

    const layer = selectedLayer();
    if (operation === "brightnessContrast") {
      if (!layer.adjustBrightnessContrast) throw new Error("Brightness/contrast is unavailable for this layer type");
      await layer.adjustBrightnessContrast(numeric(params.brightness, 0), numeric(params.contrast, 0));
    } else if (operation === "levels") {
      if (!layer.adjustLevels) throw new Error("Levels is unavailable for this layer type");
      await layer.adjustLevels(
        numeric(params.inputRangeStart, 0),
        numeric(params.inputRangeEnd, 255),
        numeric(params.inputGamma, 1),
        numeric(params.outputRangeStart, 0),
        numeric(params.outputRangeEnd, 255)
      );
    } else if (operation === "hueSaturation" && layer.adjustHueSaturation) {
      await layer.adjustHueSaturation(
        numeric(params.hue, 0),
        numeric(params.saturation, 0),
        numeric(params.lightness, 0)
      );
    } else if (operation === "invert" && layer.invert) {
      await layer.invert();
    } else {
      if (!Array.isArray(params.descriptors)) throw new Error("Unsupported typed adjustment; provide descriptors for batchPlay fallback");
      return action.batchPlay(params.descriptors, {});
    }
    return compactLayer(layer);
  });
}

async function applyFilter(params) {
  return runModal("filter", async () => {
    let layer = selectedLayer();
    const operation = params.operation;
    const smart = params.smart === true || String(operation || "").startsWith("smart");

    if (smart && String(layer.kind) !== String(constants.LayerKind.SMARTOBJECT)) {
      await action.batchPlay([{ _obj: "newPlacedLayer", _options: { dialogOptions: "silent" } }], {});
      layer = selectedLayer();
    }

    const normalized = String(operation || "").replace(/^smart/i, "");
    const key = normalized.charAt(0).toLowerCase() + normalized.slice(1);
    if (key === "gaussianBlur") {
      if (!layer.applyGaussianBlur) throw new Error("Gaussian blur is unavailable for this layer type");
      await layer.applyGaussianBlur(numeric(params.radius, 4));
    } else if (key === "sharpen") {
      if (!layer.applySharpen) throw new Error("Sharpen is unavailable for this layer type");
      await layer.applySharpen();
    } else if (key === "addNoise") {
      if (!layer.applyAddNoise) throw new Error("Add Noise is unavailable for this layer type");
      const distribution = String(params.distribution || "gaussian").toUpperCase();
      const dist = constants.NoiseDistribution[distribution] || constants.NoiseDistribution.GAUSSIAN;
      await layer.applyAddNoise(numeric(params.amount, 2), dist, params.monochromatic === true);
    } else if (key === "blur") {
      if (!layer.applyBlur) throw new Error("Blur is unavailable for this layer type");
      await layer.applyBlur();
    } else if (key === "despeckle") {
      if (!layer.applyDespeckle) throw new Error("Despeckle is unavailable for this layer type");
      await layer.applyDespeckle();
    } else {
      if (!Array.isArray(params.descriptors)) throw new Error("Unsupported typed filter; provide descriptors for batchPlay fallback");
      return action.batchPlay(params.descriptors, {});
    }
    return { ...compactLayer(layer), smartFilter: smart };
  });
}

async function manageSmartObject(params) {
  const operation = String(params.operation || "replaceContents");

  if (operation === "convert") {
    return runModal("convert smart object", async () => {
      await action.batchPlay([{ _obj: "newPlacedLayer", _options: { dialogOptions: "silent" } }], {});
      return { converted: true, layer: compactLayer(selectedLayer()) };
    });
  }

  if (operation === "editContents") {
    return runModal("edit smart object contents", async () => {
      await action.batchPlay([{ _obj: "placedLayerEditContents", _options: { dialogOptions: "silent" } }], {});
      const doc = requireDocument();
      return { opened: true, document: { id: doc.id, title: doc.title, path: doc.path || null } };
    });
  }

  if (operation === "updateModified") {
    return runModal("update smart object", async () => {
      const command = params.all === true ? "placedLayerUpdateAllModified" : "placedLayerUpdateModified";
      const result = await action.batchPlay([{ _obj: command, _options: { dialogOptions: "silent" } }], {});
      return { updated: true, all: params.all === true, result };
    });
  }

  if (operation === "replaceContents" || operation === "relink") {
    const entry = await existingEntry(params.path);
    const token = fs.createSessionToken(entry);
    return runModal(operation === "relink" ? "relink smart object" : "replace smart object", async () => {
      const result = await action.batchPlay([{
        _obj: operation === "relink" ? "placedLayerRelinkToFile" : "placedLayerReplaceContents",
        null: { _path: token, _kind: "local" },
        pageNumber: 1,
        _options: { dialogOptions: "silent" }
      }], {});
      return { operation, path: entry.nativePath, result };
    });
  }

  return runBatchPlay("photoshop.smart-objects.manage", params);
}

async function exportAssets(params) {
  const doc = requireDocument();
  const path = params.path;
  const format = String(params.format || String(path).split(".").pop() || "png").toLowerCase();
  const entry = await writableEntry(path);
  return runModal("export", async () => {
    if (format === "png") {
      await doc.saveAs.png(entry, {}, true);
    } else if (format === "jpg" || format === "jpeg") {
      const quality = Math.max(0, Math.min(12, Math.round(numeric(params.quality, 10))));
      await doc.saveAs.jpg(entry, { quality }, true);
    } else if (format === "psd") {
      await doc.saveAs.psd(entry, {}, params.asCopy === true);
    } else if (format === "psb") {
      await doc.saveAs.psb(entry, {}, params.asCopy === true);
    } else {
      throw new Error("Supported export formats: png, jpg, psd, psb");
    }
    return { path: entry.nativePath, format };
  });
}

async function runBatchPlay(op, params) {
  if (!Array.isArray(params.descriptors) || params.descriptors.length === 0) {
    throw new Error(op + " has no typed handler for this operation and descriptors were not provided");
  }
  return runModal(op, () => action.batchPlay(params.descriptors, {
    synchronousExecution: false,
    modalBehavior: "execute"
  }));
}

async function dispatch(op, params = {}) {
  if (op === "photoshop.context.inspect") return inspectContext();
  if (op === "photoshop.document.manage") return manageDocument(params);
  if (op === "photoshop.layers.manage") return manageLayer(params);
  if (op === "photoshop.text.manage") return manageText(params);
  if (op === "photoshop.selection.mask") return manageSelection(params);
  if (op === "photoshop.paint.retouched") return paintRetouch(params);
  if (op === "photoshop.adjustments.apply") return applyAdjustment(params);
  if (op === "photoshop.filters.apply") return applyFilter(params);
  if (op === "photoshop.smart-objects.manage") return manageSmartObject(params);
  if (op === "photoshop.export.assets") return exportAssets(params);

  if (op.startsWith("photoshop.")) return runBatchPlay(op, params);
  throw new Error("Unsupported operation: " + op);
}

async function handle(message) {
  if (!message || message.type !== "command" || typeof message.id !== "string") return;
  try {
    const data = await dispatch(message.op, message.params || {});
    send({ type: "result", id: message.id, ok: true, data });
    if (message.op !== "photoshop.context.inspect") {
      try { send({ type: "event", event: "context", data: await inspectContext() }); } catch {}
    }
  } catch (error) {
    send({
      type: "result",
      id: message.id,
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, retryMs);
  retryMs = Math.min(Math.round(retryMs * 1.8), 5000);
}

function connect() {
  if (stopped || (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING))) return;
  setStatus("Connecting to Adobe MCP…", false);
  try { socket = new WebSocket(WS_URL); } catch { scheduleReconnect(); return; }

  socket.onopen = () => {
    retryMs = 250;
    setStatus("Connected", true);
    send({
      type: "hello",
      app: "photoshop",
      appVersion: String(app.version ?? ""),
      adapterVersion: "0.3.0",
      capabilities: CAPABILITIES
    });
    inspectContext()
      .then((data) => send({ type: "event", event: "context", data }))
      .catch(() => {});
  };
  socket.onmessage = (event) => { try { handle(JSON.parse(event.data)); } catch {} };
  socket.onerror = () => setStatus("Bridge unavailable; reconnecting…", false);
  socket.onclose = () => {
    socket = null;
    setStatus("Disconnected; reconnecting…", false);
    scheduleReconnect();
  };
}

entrypoints.setup({
  panels: {
    adobeMcpBridge: {
      show() { stopped = false; connect(); },
      hide() {},
      destroy() {
        stopped = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        if (socket) socket.close();
        socket = null;
      }
    }
  }
});

connect();

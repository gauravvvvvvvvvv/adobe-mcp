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
    } else if (operation === "groupSelected") {
      const group = await doc.groupLayers(doc.activeLayers);
      if (typeof params.name === "string") group.name = params.name;
      return compactLayer(group);
    } else {
      throw new Error("Supported layer operations: create, rename, opacity, visibility, duplicate, delete, rotate, scale, groupSelected");
    }

    return compactLayer(layer);
  });
}

async function manageText(params) {
  return runModal("text edit", async () => {
    const doc = requireDocument();
    if (params.operation === "create" || params.operation === undefined) {
      const layer = await doc.createTextLayer({
        name: typeof params.name === "string" ? params.name : "Text",
        contents: typeof params.text === "string" ? params.text : "",
        fontName: typeof params.fontName === "string" ? params.fontName : undefined,
        fontSize: numeric(params.fontSize, 48),
        position: params.position && typeof params.position === "object"
          ? { x: numeric(params.position.x), y: numeric(params.position.y) }
          : undefined,
        opacity: numeric(params.opacity, 100)
      });
      return compactLayer(layer);
    }

    const layer = selectedLayer();
    if (!layer.textItem) throw new Error("Selected layer is not a text layer");
    if (params.operation === "setText") {
      if (typeof params.text !== "string") throw new Error("text is required");
      layer.textItem.contents = params.text;
    } else if (params.operation === "setSize") {
      layer.textItem.characterStyle.size = numeric(params.fontSize);
    } else {
      throw new Error("Supported text operations: create, setText, setSize");
    }
    return compactLayer(layer);
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

async function applyAdjustment(params) {
  return runModal("adjustment", async () => {
    const layer = selectedLayer();
    const operation = params.operation;
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
    } else {
      if (!Array.isArray(params.descriptors)) throw new Error("Unsupported typed adjustment; provide descriptors for batchPlay fallback");
      return action.batchPlay(params.descriptors, {});
    }
    return compactLayer(layer);
  });
}

async function applyFilter(params) {
  return runModal("filter", async () => {
    const layer = selectedLayer();
    const operation = params.operation;
    if (operation === "gaussianBlur") {
      if (!layer.applyGaussianBlur) throw new Error("Gaussian blur is unavailable for this layer type");
      await layer.applyGaussianBlur(numeric(params.radius, 4));
    } else if (operation === "sharpen") {
      if (!layer.applySharpen) throw new Error("Sharpen is unavailable for this layer type");
      await layer.applySharpen();
    } else {
      if (!Array.isArray(params.descriptors)) throw new Error("Unsupported typed filter; provide descriptors for batchPlay fallback");
      return action.batchPlay(params.descriptors, {});
    }
    return compactLayer(layer);
  });
}

async function manageSmartObject(params) {
  if (params.operation !== "replaceContents") {
    return runBatchPlay("photoshop.smart-objects.manage", params);
  }
  const entry = await existingEntry(params.path);
  const token = fs.createSessionToken(entry);
  return runModal("replace smart object", async () => {
    const result = await action.batchPlay([{
      _obj: "placedLayerReplaceContents",
      null: { _path: token, _kind: "local" },
      pageNumber: 1,
      _options: { dialogOptions: "silent" }
    }], {});
    return { replaced: true, path: entry.nativePath, result };
  });
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
      adapterVersion: "0.2.0",
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

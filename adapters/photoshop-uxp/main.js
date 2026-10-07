const { entrypoints } = require("uxp");
const photoshop = require("photoshop");
const { app, action, core } = photoshop;

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
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function compactLayer(layer) {
  return {
    id: layer.id,
    name: layer.name,
    kind: String(layer.kind ?? ""),
    visible: layer.visible,
    opacity: layer.opacity
  };
}

async function inspectContext() {
  const documents = app.documents ?? [];
  if (!documents.length) {
    return { documents: 0, activeDocument: null };
  }

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

function selectedLayer() {
  const doc = app.activeDocument;
  const layers = doc?.activeLayers ?? [];
  if (!layers.length) throw new Error("No selected Photoshop layer");
  return layers[0];
}

async function manageLayer(params) {
  const operation = params.operation;
  return core.executeAsModal(async () => {
    const layer = selectedLayer();

    if (operation === "rename") {
      if (typeof params.name !== "string" || !params.name) throw new Error("name is required");
      layer.name = params.name;
    } else if (operation === "opacity") {
      const value = Number(params.value);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("value must be 0..100");
      layer.opacity = value;
    } else if (operation === "visibility") {
      layer.visible = Boolean(params.visible);
    } else {
      throw new Error("Supported layer operations: rename, opacity, visibility");
    }

    return compactLayer(layer);
  }, { commandName: "Adobe MCP: layer edit" });
}

async function runBatchPlay(op, params) {
  if (!Array.isArray(params.descriptors) || params.descriptors.length === 0) {
    throw new Error(op + " is available through descriptors until its typed handler is implemented");
  }

  return core.executeAsModal(
    () => action.batchPlay(params.descriptors, {
      synchronousExecution: false,
      modalBehavior: "execute"
    }),
    { commandName: "Adobe MCP: " + op }
  );
}

async function dispatch(op, params = {}) {
  if (op === "photoshop.context.inspect") return inspectContext();
  if (op === "photoshop.layers.manage") return manageLayer(params);

  // Broad escape hatch: semantic capabilities may carry recorded/generated
  // batchPlay descriptors while typed handlers are added incrementally.
  if (op.startsWith("photoshop.")) return runBatchPlay(op, params);

  throw new Error("Unsupported operation: " + op);
}

async function handle(message) {
  if (!message || message.type !== "command" || typeof message.id !== "string") return;
  try {
    const data = await dispatch(message.op, message.params || {});
    send({ type: "result", id: message.id, ok: true, data });

    if (message.op !== "photoshop.context.inspect") {
      try {
        send({ type: "event", event: "context", data: await inspectContext() });
      } catch {}
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
  try {
    socket = new WebSocket(WS_URL);
  } catch {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    retryMs = 250;
    setStatus("Connected", true);
    send({
      type: "hello",
      app: "photoshop",
      appVersion: String(app.version ?? ""),
      adapterVersion: "0.1.0",
      capabilities: CAPABILITIES
    });
    inspectContext()
      .then((data) => send({ type: "event", event: "context", data }))
      .catch(() => {});
  };

  socket.onmessage = (event) => {
    try {
      handle(JSON.parse(event.data));
    } catch {}
  };

  socket.onerror = () => {
    setStatus("Bridge unavailable; reconnecting…", false);
  };

  socket.onclose = () => {
    socket = null;
    setStatus("Disconnected; reconnecting…", false);
    scheduleReconnect();
  };
}

entrypoints.setup({
  panels: {
    adobeMcpBridge: {
      show() {
        stopped = false;
        connect();
      },
      hide() {
        // Keep the socket alive while the panel is hidden. Hiding a panel
        // must never disable automation.
      },
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

const { entrypoints, host, storage } = require("uxp");
const ame = require("mediaencoder");
const fs = storage.localFileSystem;

const WS_URL = "ws://127.0.0.1:38470";
const CAPABILITIES = [
  "media-encoder.context.inspect",
  "media-encoder.queue.manage",
  "media-encoder.presets.manage"
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

function requiredString(params, key) {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(key + " is required");
  return value;
}

function normalizeFileUrl(path) {
  const value = requiredString({ path }, "path").replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(value)) return "file:/" + value;
  if (value.startsWith("/")) return "file:" + value;
  if (value.startsWith("file:/")) return value;
  throw new Error("An absolute preset filesystem path is required");
}

async function presetManage(params) {
  const operation = String(params.operation || "inspect");
  if (operation === "inspect" || operation === "validate") {
    const entry = await fs.getEntryWithUrl(normalizeFileUrl(requiredString(params, "path")));
    const name = String(entry.name || "");
    if (!/\.epr$/i.test(name)) throw new Error("Expected an Adobe Media Encoder .epr preset");
    return {
      success: true,
      operation,
      name,
      path: entry.nativePath || requiredString(params, "path"),
      isFile: entry.isFile !== false
    };
  }
  if (operation === "listFolder") {
    const folder = await fs.getEntryWithUrl(normalizeFileUrl(requiredString(params, "path")));
    if (typeof folder.getEntries !== "function") throw new Error("Preset path is not a folder");
    const entries = await folder.getEntries();
    const presets = entries
      .filter((entry) => /\.epr$/i.test(String(entry.name || "")))
      .slice(0, Math.max(1, Math.min(Number(params.limit) || 200, 1000)))
      .map((entry) => ({ name: entry.name, path: entry.nativePath || entry.name }));
    return { success: true, operation, folder: folder.nativePath || params.path, presets, count: presets.length };
  }
  throw new Error("Supported preset operations: inspect, validate, listFolder");
}

function compactJob(job) {
  if (!job) return null;
  const out = {};
  const getters = [
    ["status", "getStatus"],
    ["presetName", "getPresetName"],
    ["videoSummary", "getVideoSummary"],
    ["audioSummary", "getAudioSummary"],
    ["bitrateSummary", "getBitrateSummary"]
  ];
  for (const [key, method] of getters) {
    try {
      if (typeof job[method] === "function") out[key] = job[method]();
    } catch {}
  }
  try { if (job.id !== undefined) out.id = String(job.id); } catch {}
  try { if (job.groupID !== undefined) out.groupID = String(job.groupID); } catch {}
  return out;
}

function inspectContext() {
  const queue = ame.RenderQueue;
  const instance = queue.getInstance();
  return {
    renderQueue: {
      status: instance.getStatus(),
      constants: {
        stopped: queue.RENDER_QUEUE_STOPPED,
        paused: queue.RENDER_QUEUE_PAUSED,
        running: queue.RENDER_QUEUE_RUNNING,
        stopping: queue.RENDER_QUEUE_STOPPING,
        invalid: queue.RENDER_QUEUE_INVALID_STATE
      }
    },
    host: {
      name: host && host.name ? String(host.name) : "Adobe Media Encoder",
      version: host && host.version ? String(host.version) : ""
    }
  };
}

async function queueManage(params) {
  const queue = ame.RenderQueue;
  const operation = String(params.operation || "status");

  if (operation === "status") return inspectContext();
  if (operation === "start") return { success: await queue.start(), operation };
  if (operation === "pause") return { success: await queue.pause(), operation };
  if (operation === "stop") return { success: await queue.stop(), operation };
  if (operation === "stopCurrent") return { success: await queue.stopCurrent(), operation };
  if (operation === "removeAll") return { success: await queue.removeAllJobs(), operation };

  if (operation === "enqueue") {
    return queue.enqueueFile(
      requiredString(params, "sourcePath"),
      requiredString(params, "presetPath"),
      requiredString(params, "outputPath")
    );
  }

  if (operation === "render") {
    return queue.renderFile(
      requiredString(params, "sourcePath"),
      requiredString(params, "presetPath"),
      requiredString(params, "outputPath")
    );
  }

  if (operation === "stitch") {
    const sources = Array.isArray(params.sourcePaths) ? params.sourcePaths.filter((x) => typeof x === "string" && x) : [];
    if (!sources.length) throw new Error("sourcePaths is required");
    return queue.stitchFiles(
      sources,
      requiredString(params, "presetPath"),
      requiredString(params, "outputPath")
    );
  }

  if (operation === "imageSequence") {
    return {
      success: await queue.enqueueImagesAsSequence(
        requiredString(params, "folderPath"),
        requiredString(params, "firstImagePath"),
        requiredString(params, "presetPath"),
        typeof params.outputPath === "string" ? params.outputPath : ""
      )
    };
  }

  if (operation === "job") {
    const id = requiredString(params, "jobId");
    return { job: compactJob(queue.getJob(id)) };
  }

  if (operation === "log") {
    return {
      log: queue.getLogOutput(
        requiredString(params, "jobGroupId"),
        requiredString(params, "jobId")
      )
    };
  }

  if (operation === "missingAssets") {
    return {
      missingAssets: queue.getMissingAssets(
        requiredString(params, "jobGroupId"),
        requiredString(params, "jobId"),
        params.includeSource !== false,
        params.includeOutput !== false
      )
    };
  }

  if (operation === "projectItems") {
    return queue.getProjectItemGUIDs(requiredString(params, "projectPath"));
  }

  if (operation === "addOutput") {
    const group = queue.getJobGroup(requiredString(params, "jobGroupId"));
    if (!group) throw new Error("Render job group not found");
    const job = group.addOutput(
      requiredString(params, "presetPath"),
      requiredString(params, "outputPath")
    );
    if (!job) throw new Error("Media Encoder could not add output");
    return { success: true, job: compactJob(job) };
  }

  throw new Error("Supported queue operations: status, start, pause, stop, stopCurrent, removeAll, enqueue, render, stitch, imageSequence, job, log, missingAssets, projectItems, addOutput");
}

async function dispatch(op, params = {}) {
  if (op === "media-encoder.context.inspect") return inspectContext();
  if (op === "media-encoder.queue.manage") return queueManage(params);
  if (op === "media-encoder.presets.manage") return presetManage(params);
  throw new Error("Unsupported Media Encoder operation: " + op);
}

async function handle(message) {
  if (!message || message.type !== "command" || typeof message.id !== "string") return;
  try {
    const data = await dispatch(message.op, message.params || {});
    send({ type: "result", id: message.id, ok: true, data });
    try { send({ type: "event", event: "context", data: inspectContext() }); } catch {}
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
  try { socket = new WebSocket(WS_URL); }
  catch { scheduleReconnect(); return; }

  socket.onopen = () => {
    retryMs = 250;
    setStatus("Connected", true);
    send({
      type: "hello",
      app: "media-encoder",
      appVersion: host && host.version ? String(host.version) : "",
      adapterVersion: "0.1.0",
      capabilities: CAPABILITIES
    });
    try { send({ type: "event", event: "context", data: inspectContext() }); } catch {}
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

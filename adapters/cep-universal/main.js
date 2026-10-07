(function () {
  "use strict";

  var WS_URL = "ws://127.0.0.1:38470";
  var HOST_MAP = {
    PPRO: "premiere",
    AEFT: "after-effects",
    ILST: "illustrator",
    IDSN: "indesign"
  };

  var CAPABILITIES = {
    premiere: [
      "premiere.context.inspect",
      "premiere.project.manage",
      "premiere.timeline.edit",
      "premiere.timeline.assemble",
      "premiere.effects.apply",
      "premiere.motion.animate",
      "premiere.color.grade",
      "premiere.audio.mix",
      "premiere.captions.manage",
      "premiere.graphics.manage",
      "premiere.export.render"
    ],
    "after-effects": [
      "after-effects.context.inspect",
      "after-effects.composition.manage",
      "after-effects.layers.manage",
      "after-effects.properties.animate",
      "after-effects.shapes.draw",
      "after-effects.text.animate",
      "after-effects.masks.mattes",
      "after-effects.effects.apply",
      "after-effects.three-d.scene",
      "after-effects.tracking.apply",
      "after-effects.render.queue"
    ],
    illustrator: [
      "illustrator.context.inspect",
      "illustrator.document.manage",
      "illustrator.vector.create",
      "illustrator.vector.transform",
      "illustrator.appearance.style",
      "illustrator.text.manage",
      "illustrator.symbols.patterns",
      "illustrator.image.trace",
      "illustrator.export.assets"
    ],
    indesign: [
      "indesign.document.layout"
    ]
  };

  var socket = null;
  var reconnectTimer = null;
  var retryMs = 250;
  var evalBusy = false;
  var evalQueue = [];

  function cep() {
    return window.__adobe_cep__;
  }

  function hostEnvironment() {
    try {
      var raw = cep().getHostEnvironment();
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_) {
      return {};
    }
  }

  var env = hostEnvironment();
  var appName = env.appName || "";
  var appId = HOST_MAP[appName] || null;

  function setStatus(text, connected) {
    var status = document.getElementById("status");
    var dot = document.getElementById("dot");
    var host = document.getElementById("host");
    if (status) status.textContent = text;
    if (dot) dot.style.background = connected ? "#43b581" : "#777";
    if (host) host.textContent = appId ? (appId + " " + (env.appVersion || "")) : ("Unsupported CEP host: " + appName);
  }

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function escapeForEval(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }

  function evalScript(script) {
    return new Promise(function (resolve, reject) {
      evalQueue.push({ script: script, resolve: resolve, reject: reject });
      drainEvalQueue();
    });
  }

  function drainEvalQueue() {
    if (evalBusy || !evalQueue.length) return;
    evalBusy = true;
    var job = evalQueue.shift();

    try {
      cep().evalScript(job.script, function (result) {
        evalBusy = false;
        if (result === "EvalScript error.") {
          job.reject(new Error("ExtendScript execution failed"));
        } else {
          job.resolve(result);
        }
        drainEvalQueue();
      });
    } catch (error) {
      evalBusy = false;
      job.reject(error);
      drainEvalQueue();
    }
  }

  function premiereContextScript() {
    return [
      "(function(){",
      "try {",
      "var p=app.project;",
      "var s=p.activeSequence;",
      "var out={project:{name:p.name,path:p.path||null},activeSequence:null};",
      "if(s){",
      "out.activeSequence={name:s.name,id:s.sequenceID,videoTracks:s.videoTracks.numTracks,audioTracks:s.audioTracks.numTracks,playheadSeconds:s.getPlayerPosition().seconds};",
      "}",
      "return JSON.stringify(out);",
      "}catch(e){return JSON.stringify({error:String(e)});}",
      "})()"
    ].join("");
  }

  function afterEffectsContextScript() {
    return [
      "(function(){",
      "try {",
      "var p=app.project;",
      "var a=p.activeItem;",
      "var out={project:{file:p.file?p.file.fsName:null,numItems:p.numItems},activeItem:null};",
      "if(a && a instanceof CompItem){",
      "var sel=[];for(var i=0;i<a.selectedLayers.length&&i<50;i++){var l=a.selectedLayers[i];sel.push({index:l.index,name:l.name,enabled:l.enabled,inPoint:l.inPoint,outPoint:l.outPoint});}",
      "out.activeItem={type:'comp',id:a.id,name:a.name,width:a.width,height:a.height,duration:a.duration,frameRate:a.frameRate,time:a.time,numLayers:a.numLayers,selectedLayers:sel};",
      "}else if(a){out.activeItem={type:'item',id:a.id,name:a.name};}",
      "return JSON.stringify(out);",
      "}catch(e){return JSON.stringify({error:String(e)});}",
      "})()"
    ].join("");
  }

  function illustratorContextScript() {
    return [
      "(function(){",
      "try {",
      "if(app.documents.length===0)return JSON.stringify({documents:0,activeDocument:null});",
      "var d=app.activeDocument;",
      "return JSON.stringify({documents:app.documents.length,activeDocument:{name:d.name,fullName:d.fullName?d.fullName.fsName:null,artboards:d.artboards.length,layers:d.layers.length,selection:d.selection?d.selection.length:0,width:d.width,height:d.height}});",
      "}catch(e){return JSON.stringify({error:String(e)});}",
      "})()"
    ].join("");
  }

  function indesignContextScript() {
    return [
      "(function(){",
      "try {",
      "if(app.documents.length===0)return JSON.stringify({documents:0,activeDocument:null});",
      "var d=app.activeDocument;",
      "return JSON.stringify({documents:app.documents.length,activeDocument:{name:d.name,fullName:d.saved?d.fullName.fsName:null,pages:d.pages.length,spreads:d.spreads.length,stories:d.stories.length,selection:app.selection?app.selection.length:0}});",
      "}catch(e){return JSON.stringify({error:String(e)});}",
      "})()"
    ].join("");
  }

  function contextScript() {
    if (appId === "premiere") return premiereContextScript();
    if (appId === "after-effects") return afterEffectsContextScript();
    if (appId === "illustrator") return illustratorContextScript();
    if (appId === "indesign") return indesignContextScript();
    throw new Error("Unsupported host");
  }

  async function inspectContext() {
    var raw = await evalScript(contextScript());
    try { return JSON.parse(raw); }
    catch (_) { return { raw: raw }; }
  }

  async function dispatch(op, params) {
    if (op === appId + ".context.inspect") return inspectContext();

    // Temporary broad escape hatch. Higher-level typed compilers will emit
    // ExtendScript internally so model calls stay semantic and compact.
    if (params && typeof params.script === "string" && params.script.length) {
      var raw = await evalScript(params.script);
      try { return JSON.parse(raw); }
      catch (_) { return { raw: raw }; }
    }

    throw new Error(op + " does not have a typed CEP handler yet");
  }

  async function handle(message) {
    if (!message || message.type !== "command" || typeof message.id !== "string") return;
    try {
      var data = await dispatch(message.op, message.params || {});
      send({ type: "result", id: message.id, ok: true, data: data });

      if (message.op !== appId + ".context.inspect") {
        try {
          send({ type: "event", event: "context", data: await inspectContext() });
        } catch (_) {}
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
    if (reconnectTimer || !appId) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, retryMs);
    retryMs = Math.min(Math.round(retryMs * 1.8), 5000);
  }

  function connect() {
    if (!appId) {
      setStatus("Unsupported host", false);
      return;
    }
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    setStatus("Connecting to Adobe MCP…", false);
    try { socket = new WebSocket(WS_URL); }
    catch (_) { scheduleReconnect(); return; }

    socket.onopen = function () {
      retryMs = 250;
      setStatus("Connected", true);
      send({
        type: "hello",
        app: appId,
        appVersion: String(env.appVersion || ""),
        adapterVersion: "0.1.0",
        capabilities: CAPABILITIES[appId] || []
      });
      inspectContext()
        .then(function (data) { send({ type: "event", event: "context", data: data }); })
        .catch(function () {});
    };

    socket.onmessage = function (event) {
      try { handle(JSON.parse(event.data)); } catch (_) {}
    };

    socket.onerror = function () {
      setStatus("Bridge unavailable; reconnecting…", false);
    };

    socket.onclose = function () {
      socket = null;
      setStatus("Disconnected; reconnecting…", false);
      scheduleReconnect();
    };
  }

  connect();
})();

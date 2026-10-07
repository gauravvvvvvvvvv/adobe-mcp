import { finiteNumber, integer, js, optionalString, requireString, wrapScript } from "./common.js";

function uri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) return "file:///" + normalized;
  if (normalized.startsWith("/")) return "file://" + normalized;
  if (normalized.startsWith("file:/")) return normalized;
  return normalized;
}

const HELPERS = [
  'function __doc(){var d=fl.getDocumentDOM();if(!d)throw new Error("No active Animate document");return d;}',
  'function __timeline(){return __doc().getTimeline();}',
  'function __layer(t,spec){if(spec.index!==undefined){var i=Number(spec.index);if(i>=0&&i<t.layers.length)return t.layers[i];}if(spec.name!==undefined){for(var j=0;j<t.layers.length;j++){if(String(t.layers[j].name)===String(spec.name))return t.layers[j];}}throw new Error("Animate layer not found");}'
].join("\n");

export function compileAnimate(capability: string, params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.script === "string" && params.script) return params;
  if (capability !== "animate.timeline.author") return params;

  const operation = String(params.operation ?? "");
  let body = HELPERS;

  if (operation === "createDocument") {
    body += 'var d=fl.createDocument("timeline");if(!d)throw new Error("Animate document creation failed");';
    if (params.width !== undefined) body += 'd.width=' + Math.max(1, integer(params.width, 1920)) + ';';
    if (params.height !== undefined) body += 'd.height=' + Math.max(1, integer(params.height, 1080)) + ';';
    if (params.frameRate !== undefined) body += 'd.frameRate=' + Math.max(1, finiteNumber(params.frameRate, 30)) + ';';
    if (typeof params.backgroundColor === "string") body += 'd.backgroundColor=' + js(params.backgroundColor) + ';';
    body += 'return JSON.stringify({success:true,operation:"createDocument",name:d.name,width:d.width,height:d.height,frameRate:d.frameRate});';
  } else if (operation === "open") {
    const path = uri(requireString(params, "path"));
    body += 'var d=fl.openDocument(' + js(path) + ');if(!d)throw new Error("Animate could not open document");return JSON.stringify({success:true,operation:"open",name:d.name,path:' + js(path) + '});';
  } else if (operation === "save") {
    const path = optionalString(params, "path");
    body += 'var d=__doc();var ok=fl.saveDocument(d' + (path ? ',' + js(uri(path)) : '') + ');return JSON.stringify({success:ok!==false,operation:"save",name:d.name,path:' + (path ? js(uri(path)) : 'null') + '});';
  } else if (operation === "publish") {
    body += 'var d=__doc();d.publish();return JSON.stringify({success:true,operation:"publish",profile:d.currentPublishProfile});';
  } else if (operation === "exportPNG") {
    const path = uri(requireString(params, "path"));
    body += 'var d=__doc();var ok=d.exportPNG(' + js(path) + ',' + (params.currentSettings !== false ? "true" : "false") + ',' + (params.currentFrame === true ? "true" : "false") + ');return JSON.stringify({success:ok!==false,operation:"exportPNG",path:' + js(path) + '});';
  } else if (operation === "exportVideo") {
    const path = uri(requireString(params, "path"));
    body += 'var d=__doc();d.exportVideo(' + js(path) + ',' + (params.mediaEncoder !== false ? "true" : "false") + ',' + (params.transparent === true ? "true" : "false") + ',' + (params.stopAtFrame !== false ? "true" : "false") + ',' + Math.max(0, finiteNumber(params.stopAtFrameOrTime, 0)) + ');return JSON.stringify({success:true,operation:"exportVideo",path:' + js(path) + '});';
  } else {
    body += 'var d=__doc();var t=d.getTimeline();';
    const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};

    if (operation === "addLayer") {
      const name = optionalString(params, "name") ?? "Layer";
      const type = String(params.layerType ?? "normal");
      body += 'var idx=t.addNewLayer(' + js(name) + ',' + js(type) + ',' + (params.addAbove !== false ? "true" : "false") + ');return JSON.stringify({success:true,operation:"addLayer",index:idx,name:t.layers[idx].name,layerType:t.layers[idx].layerType});';
    } else if (operation === "renameLayer") {
      const name = requireString(params, "name");
      body += 'var l=__layer(t,' + js(target) + ');var old=l.name;l.name=' + js(name) + ';return JSON.stringify({success:true,operation:"renameLayer",before:old,after:l.name});';
    } else if (operation === "setLayerState") {
      body += 'var l=__layer(t,' + js(target) + ');';
      if (params.visible !== undefined) body += 'l.visible=' + (params.visible === true ? "true" : "false") + ';';
      if (params.locked !== undefined) body += 'l.locked=' + (params.locked === true ? "true" : "false") + ';';
      body += 'return JSON.stringify({success:true,operation:"setLayerState",name:l.name,visible:l.visible,locked:l.locked});';
    } else if (operation === "setFrame") {
      const frame = Math.max(0, integer(params.frame, 0));
      body += 't.currentFrame=' + frame + ';return JSON.stringify({success:true,operation:"setFrame",frame:t.currentFrame});';
    } else if (operation === "insertFrames") {
      const count = Math.max(1, integer(params.count, 1));
      const frame = Math.max(0, integer(params.frame, 0));
      body += 't.currentLayer=' + Math.max(0, integer(params.layerIndex, 0)) + ';t.insertFrames(' + count + ',' + (params.allLayers === true ? "true" : "false") + ',' + frame + ');return JSON.stringify({success:true,operation:"insertFrames",count:' + count + ',frame:' + frame + '});';
    } else if (operation === "keyframe") {
      const frame = Math.max(0, integer(params.frame, 0));
      body += 't.currentLayer=' + Math.max(0, integer(params.layerIndex, 0)) + ';t.insertKeyframe(' + frame + ');return JSON.stringify({success:true,operation:"keyframe",frame:' + frame + '});';
    } else if (operation === "blankKeyframe") {
      const frame = Math.max(0, integer(params.frame, 0));
      body += 't.currentLayer=' + Math.max(0, integer(params.layerIndex, 0)) + ';t.insertBlankKeyframe(' + frame + ');return JSON.stringify({success:true,operation:"blankKeyframe",frame:' + frame + '});';
    } else if (operation === "removeFrames") {
      const start = Math.max(0, integer(params.start, 0));
      const end = Math.max(start + 1, integer(params.end, start + 1));
      body += 't.currentLayer=' + Math.max(0, integer(params.layerIndex, 0)) + ';t.removeFrames(' + start + ',' + end + ');return JSON.stringify({success:true,operation:"removeFrames",start:' + start + ',end:' + end + '});';
    } else if (operation === "motionTween") {
      const start = Math.max(0, integer(params.start, 0));
      const end = Math.max(start + 1, integer(params.end, start + 1));
      body += 't.currentLayer=' + Math.max(0, integer(params.layerIndex, 0)) + ';if(t.createMotionObject)t.createMotionObject(' + start + ',' + end + ');else{t.convertToKeyframes(' + start + ',' + end + ');t.setSelectedFrames(' + start + ',' + end + ',true);t.createMotionTween(' + start + ',' + end + ');}return JSON.stringify({success:true,operation:"motionTween",start:' + start + ',end:' + end + '});';
    } else if (operation === "addText") {
      const text = requireString(params, "text");
      const left = finiteNumber(params.left, 100);
      const top = finiteNumber(params.top, 100);
      const right = finiteNumber(params.right, left + 600);
      const bottom = finiteNumber(params.bottom, top + 150);
      body += 'd.addNewText({left:' + left + ',top:' + top + ',right:' + right + ',bottom:' + bottom + '},' + js(text) + ');return JSON.stringify({success:true,operation:"addText",text:' + js(text) + '});';
    } else if (operation === "align") {
      const mode = String(params.mode ?? "horizontal center");
      body += 'd.align(' + js(mode) + ',' + (params.toStage === true ? "true" : "false") + ');return JSON.stringify({success:true,operation:"align",mode:' + js(mode) + '});';
    } else {
      throw new Error("Unsupported animate.timeline.author operation");
    }
  }

  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

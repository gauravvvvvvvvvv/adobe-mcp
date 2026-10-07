import { finiteNumber, integer, js, optionalString, requireString, wrapScript } from "./common.js";

const HELPERS = [
  'function __doc(){var d=app.activeDocument;if(!d)throw new Error("No active Audition document");return d;}',
  'function __track(d,index){if(!d.audioTracks)throw new Error("Active Audition document is not multitrack");var i=Number(index);if(i<0||i>=d.audioTracks.length)throw new Error("Audition track index out of range");return d.audioTracks[i];}'
].join("\n");

export function compileAudition(capability: string, params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.script === "string" && params.script) return params;
  if (capability !== "audition.audio.process") return params;

  const operation = String(params.operation ?? "");
  let body = HELPERS;

  if (operation === "open") {
    const path = requireString(params, "path");
    body += 'var p=new DocumentOpenParameter(' + js(path) + ');var d=app.openDocument(p);if(!d)throw new Error("Audition openDocument failed");return JSON.stringify({success:true,operation:"open",id:d.id,displayName:d.displayName,path:d.path||' + js(path) + '});';
  } else if (operation === "favorite") {
    const name = requireString(params, "name");
    body += 'var d=__doc();if(!d.applyFavorite)throw new Error("Favorites are only available on waveform documents");var ok=d.applyFavorite(' + js(name) + ');return JSON.stringify({success:ok!==false,operation:"favorite",name:' + js(name) + '});';
  } else if (operation === "saveAs") {
    const path = requireString(params, "path");
    body += 'var d=__doc();if(!d.saveAs)throw new Error("saveAs is unavailable for this document type");var ok=d.saveAs(' + js(path) + ',' + (params.export === true ? "true" : "false") + ');return JSON.stringify({success:ok!==false,operation:"saveAs",path:' + js(path) + ',exported:' + (params.export === true ? "true" : "false") + '});';
  } else if (operation === "close") {
    body += 'var d=__doc();var name=d.displayName;var ok=d.closeDocument();return JSON.stringify({success:ok!==false,operation:"close",document:name});';
  } else if (operation === "transport") {
    const action = String(params.action ?? "play");
    const valid = new Set(["play","stop","pause","record"]);
    if (!valid.has(action)) throw new Error("Audition transport action must be play, stop, pause or record");
    body += 'var t=app.transport;if(!t||!t.' + action + ')throw new Error("Transport action unavailable");var ok=t.' + action + '();return JSON.stringify({success:ok!==false,operation:"transport",action:' + js(action) + ',isPlaying:t.isPlaying,isPaused:t.isPaused,isRecording:t.isRecording});';
  } else if (operation === "loop") {
    body += 'var t=app.transport;t.loop=' + (params.enabled !== false ? "true" : "false") + ';return JSON.stringify({success:true,operation:"loop",enabled:t.loop});';
  } else if (operation === "track") {
    const trackIndex = Math.max(0, integer(params.trackIndex, 0));
    body += 'var d=__doc();var tr=__track(d,' + trackIndex + ');';
    if (typeof params.name === "string") body += 'tr.name=' + js(params.name) + ';';
    if (params.mute !== undefined) body += 'tr.mute=' + (params.mute === true ? "true" : "false") + ';';
    if (params.solo !== undefined) body += 'tr.solo=' + (params.solo === true ? "true" : "false") + ';';
    if (params.armed !== undefined) body += 'tr.armed=' + (params.armed === true ? "true" : "false") + ';';
    if (params.selected !== undefined) body += 'tr.selected=' + (params.selected === true ? "true" : "false") + ';';
    body += 'return JSON.stringify({success:true,operation:"track",trackIndex:' + trackIndex + ',id:tr.id,name:tr.name,mute:tr.mute,solo:tr.solo,armed:tr.armed,selected:tr.selected});';
  } else if (operation === "marker") {
    const startSeconds = Math.max(0, finiteNumber(params.startSeconds, 0));
    const durationSeconds = Math.max(0, finiteNumber(params.durationSeconds, 0));
    const name = optionalString(params, "name") ?? "Marker";
    const type = optionalString(params, "type") ?? "cue";
    const description = optionalString(params, "description") ?? "";
    body += 'var d=__doc();if(!d.addMarker)throw new Error("Markers are unavailable for this document");var sr=Number(d.sampleRate||48000);var ok=d.addMarker(Math.round(' + startSeconds + '*sr),Math.round(' + durationSeconds + '*sr),' + js(name) + ',' + js(type) + ',' + js(description) + ');return JSON.stringify({success:ok!==false,operation:"marker",name:' + js(name) + ',startSeconds:' + startSeconds + ',durationSeconds:' + durationSeconds + '});';
  } else if (operation === "command") {
    const command = requireString(params, "command");
    body += 'if(app.isCommandEnabled&&!app.isCommandEnabled(' + js(command) + '))throw new Error("Audition command is not enabled");var ok=app.invokeCommand(' + js(command) + ');return JSON.stringify({success:ok!==false,operation:"command",command:' + js(command) + '});';
  } else {
    throw new Error("Unsupported audition.audio.process operation");
  }

  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

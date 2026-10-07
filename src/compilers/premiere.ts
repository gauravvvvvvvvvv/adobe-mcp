import { finiteNumber, integer, js, objectArray, optionalString, requireString, wrapScript } from "./common.js";

const HELPERS = [
'function __time(seconds){var t=new Time();t.seconds=Number(seconds);return t;}',
'function __sec(value){if(value===null||value===undefined)return null;try{if(typeof value.seconds==="number")return value.seconds;}catch(_){}try{if(value.ticks!==undefined)return Number(value.ticks)/254016000000.0;}catch(_){}var n=Number(value);return isNaN(n)?null:n;}',
'function __findSequence(idOrName){var p=app.project;if(!p)return null;if(p.activeSequence&&(String(p.activeSequence.sequenceID)===String(idOrName)||String(p.activeSequence.name)===String(idOrName)))return p.activeSequence;for(var i=0;i<p.sequences.numSequences;i++){var s=p.sequences[i];if(String(s.sequenceID)===String(idOrName)||String(s.name)===String(idOrName))return s;}return null;}',
'function __sequence(idOrName){var s=idOrName?__findSequence(idOrName):app.project.activeSequence;if(!s)throw new Error("Sequence not found");try{if(app.project.activeSequence!==s&&app.project.openSequence)app.project.openSequence(s.sequenceID);}catch(_){}try{app.project.activeSequence=s;}catch(_){}return s;}',
'function __walk(item,fn){if(!item)return null;if(fn(item))return item;try{if(item.children){for(var i=0;i<item.children.numItems;i++){var hit=__walk(item.children[i],fn);if(hit)return hit;}}}catch(_){}return null;}',
'function __projectItemByPath(path){return __walk(app.project.rootItem,function(item){try{return item.getMediaPath&&String(item.getMediaPath())===String(path);}catch(_){return false;}});}',
'function __projectItemByName(name){return __walk(app.project.rootItem,function(item){try{return String(item.name)===String(name);}catch(_){return false;}});}',
'function __ensureProjectItem(path){var found=__projectItemByPath(path);if(found)return found;var f=new File(path);if(!f.exists)throw new Error("Media file not found: "+path);var ok=app.project.importFiles([f.fsName],true,app.project.rootItem,false);if(!ok)throw new Error("Premiere import failed: "+path);found=__projectItemByPath(f.fsName)||__projectItemByName(f.name);if(!found)throw new Error("Imported media could not be resolved: "+path);return found;}',
'function __clip(seq,spec){var type=String(spec.trackType||"video").toLowerCase();var tracks=type==="audio"?seq.audioTracks:seq.videoTracks;var ti=Number(spec.trackIndex||0);if(ti<0||ti>=tracks.numTracks)throw new Error("Track index out of range: "+ti);var track=tracks[ti];var clips=track.clips;if(spec.clipIndex!==undefined&&spec.clipIndex!==null){var ci=Number(spec.clipIndex);if(ci>=0&&ci<clips.numItems)return clips[ci];}for(var i=0;i<clips.numItems;i++){var c=clips[i];if(spec.nodeId!==undefined&&String(c.nodeId)===String(spec.nodeId))return c;if(spec.name!==undefined&&String(c.name)===String(spec.name))return c;if(spec.startSeconds!==undefined&&Math.abs(__sec(c.start)-Number(spec.startSeconds))<0.01)return c;}throw new Error("Timeline clip not found");}',
'function __component(clip,name){var needle=String(name).toLowerCase();for(var i=0;i<clip.components.numItems;i++){var c=clip.components[i];var dn=String(c.displayName||c.matchName||"").toLowerCase();if(dn===needle||dn.indexOf(needle)>=0)return c;}return null;}',
'function __property(component,name){var needle=String(name).toLowerCase();for(var i=0;i<component.properties.numItems;i++){var p=component.properties[i];var dn=String(p.displayName||p.matchName||"").toLowerCase();if(dn===needle||dn.indexOf(needle)>=0)return p;}return null;}',
'function __setKey(prop,time,value){if(!prop)throw new Error("Property not found");try{prop.setTimeVarying(true);}catch(_){}var t=__time(time);try{prop.addKey(t);}catch(_){}if(prop.setValueAtKey)prop.setValueAtKey(t,value,true);else if(prop.setValue)prop.setValue(value,true);else throw new Error("Property is not writable");}',
'function __ticks(seconds){return String(Math.round(Number(seconds)*254016000000));}',
'function __norm(s){return String(s||"").toLowerCase().replace(/[\\s_-]+/g,"");}',
'function __qeClip(seq,spec){try{app.enableQE();}catch(e){throw new Error("QE API unavailable: "+e);}var qseq=qe.project.getActiveSequence();if(!qseq)throw new Error("QE active sequence unavailable");var dom=__clip(seq,spec);var type=String(spec.trackType||"video").toLowerCase();var ti=Number(spec.trackIndex||0);var qt=type==="audio"?qseq.getAudioTrackAt(ti):qseq.getVideoTrackAt(ti);if(!qt)throw new Error("QE track unavailable");var targetTicks=null;try{targetTicks=String(dom.start.ticks);}catch(_){}var best=null,bestDelta=null;for(var i=0;i<qt.numItems;i++){var item=qt.getItemAt(i);if(!item)continue;try{if(String(item.type)!=="Clip")continue;}catch(_){}var ticks=null;try{ticks=String(item.start.ticks);}catch(_){}if(targetTicks!==null&&ticks===targetTicks)return {dom:dom,qe:item,qeTrack:qt};if(ticks!==null&&targetTicks!==null){var d=Math.abs(parseInt(ticks,10)-parseInt(targetTicks,10));if(best===null||d<bestDelta){best=item;bestDelta=d;}}}if(best)return {dom:dom,qe:best,qeTrack:qt};throw new Error("Could not map DOM clip to QE clip");}',
'function __effectComponent(clip,name,beforeCount){var needle=__norm(name);for(var i=0;i<clip.components.numItems;i++){var comp=clip.components[i];if(__norm(comp.displayName)===needle||__norm(comp.matchName)===needle)return comp;}if(clip.components.numItems>beforeCount)return clip.components[clip.components.numItems-1];return null;}',
'function __setNamedProperties(component,values){var results=[];for(var key in values){if(!values.hasOwnProperty(key))continue;var want=__norm(key),found=null;for(var i=0;i<component.properties.numItems;i++){var p=component.properties[i];if(__norm(p.displayName)===want||__norm(p.matchName)===want){found=p;break;}}if(!found){results.push({name:key,ok:false,error:"property_not_found"});continue;}try{found.setValue(values[key],true);results.push({name:key,ok:true,value:values[key]});}catch(e){results.push({name:key,ok:false,error:String(e)});}}return results;}',
'function __ensureVideoEffect(seq,spec,effectName){var mapped=__qeClip(seq,spec);var getter=String(spec.trackType||"video").toLowerCase()==="audio"?"getAudioEffectByName":"getVideoEffectByName";var effect=qe.project[getter](String(effectName));if(!effect)throw new Error("Effect not found: "+effectName);var before=mapped.dom.components.numItems;if(getter==="getAudioEffectByName")mapped.qe.addAudioEffect(effect);else mapped.qe.addVideoEffect(effect);var comp=__effectComponent(mapped.dom,effectName,before);if(!comp)throw new Error("Effect added but component could not be resolved: "+effectName);return {clip:mapped.dom,component:comp,qe:mapped.qe};}'

].join("\n");

function projectManage(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "");
  let body = HELPERS;
  if (operation === "save") {
    body += 'var ok=app.project.save();return JSON.stringify({success:ok!==false,path:app.project.path||null});';
  } else if (operation === "saveAs") {
    const path = requireString(params, "path");
    body += 'var path=' + js(path) + ';var f=new File(path);if(f.parent&&!f.parent.exists)f.parent.create();var ok=app.project.saveAs(path);return JSON.stringify({success:ok!==false,path:path});';
  } else if (operation === "open") {
    const path = requireString(params, "path");
    const bypassConversionDialog = params.bypassConversionDialog !== false;
    const bypassLocateFile = params.bypassLocateFile === true;
    const bypassWarningDialog = params.bypassWarningDialog === true;
    const hideFromMRUList = params.hideFromMRUList === true;
    body += 'var f=new File(' + js(path) + ');if(!f.exists)throw new Error("Premiere project not found");if(!app.openDocument)throw new Error("Premiere openDocument API unavailable");var ok=app.openDocument(f.fsName,' + (bypassConversionDialog?"true":"false") + ',' + (bypassLocateFile?"true":"false") + ',' + (bypassWarningDialog?"true":"false") + ',' + (hideFromMRUList?"true":"false") + ');if(ok===false)throw new Error("Premiere refused to open project");return JSON.stringify({success:true,path:app.project.path||f.fsName,name:app.project.name||f.name});';
  } else if (operation === "new") {
    const path = requireString(params, "path");
    body += 'var f=new File(' + js(path) + ');if(f.parent&&!f.parent.exists)f.parent.create();if(!app.newProject)throw new Error("Premiere newProject API unavailable");var ok=app.newProject(f.fsName);if(ok===false)throw new Error("Premiere newProject failed");return JSON.stringify({success:true,path:app.project.path||f.fsName,name:app.project.name||f.name});';
  } else if (operation === "close") {
    const save = params.save !== false;
    body += (save ? 'try{app.project.save();}catch(saveError){throw new Error("Could not save project before close: "+saveError);}' : '') + 'var path=app.project.path||null;var name=app.project.name||null;if(!app.project.closeDocument)throw new Error("Premiere closeDocument API unavailable");var result=app.project.closeDocument();return JSON.stringify({success:result===0||result===true||result===undefined,path:path,name:name,saved:' + (save?"true":"false") + ',apiResult:String(result)});';
  } else if (operation === "import") {
    const paths = Array.isArray(params.paths) ? params.paths.filter((x): x is string => typeof x === "string" && !!x) : [];
    if (!paths.length) throw new Error("paths_required");
    body += 'var paths=' + js(paths) + ';var imported=[];for(var i=0;i<paths.length;i++){var item=__ensureProjectItem(paths[i]);imported.push({name:item.name,nodeId:item.nodeId,path:(item.getMediaPath?item.getMediaPath():paths[i])});}return JSON.stringify({success:true,imported:imported});';
  } else if (operation === "createBin") {
    const name = requireString(params, "name");
    const parent = optionalString(params, "parentBinName");
    body += 'var parent=app.project.rootItem;';
    if (parent) body += 'var hit=__projectItemByName(' + js(parent) + ');if(hit)parent=hit;';
    body += 'if(!parent.createBin)throw new Error("Target does not support createBin");var bin=parent.createBin(' + js(name) + ');return JSON.stringify({success:true,name:bin.name,nodeId:bin.nodeId});';
  } else if (operation === "activateSequence") {
    const target = requireString(params, "sequence");
    body += 'var seq=__sequence(' + js(target) + ');return JSON.stringify({success:true,name:seq.name,sequenceID:seq.sequenceID});';
  } else if (operation === "createSequence") {
    const name = requireString(params, "name");
    const presetPath = requireString(params, "presetPath");
    body += 'var preset=new File(' + js(presetPath) + ');if(!preset.exists)throw new Error("Sequence preset file not found");if(!app.project.newSequence)throw new Error("Premiere newSequence API unavailable");var seq=app.project.newSequence(' + js(name) + ',preset.fsName);if(!seq)seq=__findSequence(' + js(name) + ');if(!seq)throw new Error("Sequence creation failed");return JSON.stringify({success:true,name:seq.name,sequenceID:seq.sequenceID});';
  } else {
    throw new Error("premiere.project.manage operation must be open, new, close, save, saveAs, import, createBin, activateSequence or createSequence");
  }
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function timelineAssemble(params: Record<string, unknown>): Record<string, unknown> {
  const clips = objectArray(params.clips);
  if (!clips.length) throw new Error("clips_required");
  const sequence = optionalString(params, "sequence");
  const normalized = clips.map((clip, index) => ({
    path: requireString(clip, "path"),
    sourceIn: Math.max(0, finiteNumber(clip.sourceIn, 0)),
    sourceOut: clip.sourceOut === undefined ? undefined : Math.max(0, finiteNumber(clip.sourceOut)),
    at: clip.at === undefined ? undefined : Math.max(0, finiteNumber(clip.at)),
    videoTrack: Math.max(0, integer(clip.videoTrack, 0)),
    audioTrack: Math.max(0, integer(clip.audioTrack, 0)),
    mode: clip.mode === "overwrite" ? "overwrite" : "insert",
    linkAudio: clip.linkAudio !== false,
    label: typeof clip.label === "string" ? clip.label : "clip-" + (index + 1)
  }));
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');var specs=' + js(normalized) + ';var cursor=Number(' + js(finiteNumber(params.startAt, 0)) + ');var placed=[];';
  if (params.clear === true) {
    body += 'for(var vt=0;vt<seq.videoTracks.numTracks;vt++){var vtr=seq.videoTracks[vt];for(var vi=vtr.clips.numItems-1;vi>=0;vi--){try{vtr.clips[vi].remove(false,true);}catch(_){}}}for(var at=0;at<seq.audioTracks.numTracks;at++){var atr=seq.audioTracks[at];for(var ai=atr.clips.numItems-1;ai>=0;ai--){try{atr.clips[ai].remove(false,true);}catch(_){}}}';
  }
  body += 'for(var i=0;i<specs.length;i++){var spec=specs[i];var item=__ensureProjectItem(spec.path);if(spec.sourceOut!==undefined&&spec.sourceOut!==null&&spec.sourceOut<=spec.sourceIn)throw new Error("sourceOut must be > sourceIn for "+spec.label);try{item.setInPoint(spec.sourceIn,4);if(spec.sourceOut!==undefined&&spec.sourceOut!==null)item.setOutPoint(spec.sourceOut,4);}catch(markError){item.setInPoint(spec.sourceIn,1);item.setInPoint(spec.sourceIn,2);if(spec.sourceOut!==undefined&&spec.sourceOut!==null){item.setOutPoint(spec.sourceOut,1);item.setOutPoint(spec.sourceOut,2);}}var atTime=spec.at!==undefined&&spec.at!==null?Number(spec.at):cursor;if(spec.videoTrack>=seq.videoTracks.numTracks)throw new Error("Video track does not exist: "+spec.videoTrack);var vtrack=seq.videoTracks[spec.videoTrack];if(spec.mode==="insert"){if(!vtrack.insertClip)throw new Error("insertClip unavailable on target track");vtrack.insertClip(item,atTime);}else{vtrack.overwriteClip(item,atTime);}var duration=(spec.sourceOut!==undefined&&spec.sourceOut!==null)?(spec.sourceOut-spec.sourceIn):null;if(spec.linkAudio&&seq.audioTracks.numTracks>spec.audioTrack){var atrack=seq.audioTracks[spec.audioTrack];try{if(spec.mode==="insert"&&atrack.insertClip)atrack.insertClip(item,atTime);else atrack.overwriteClip(item,atTime);}catch(audioPlacementError){}}placed.push({label:spec.label,path:spec.path,at:atTime,duration:duration,videoTrack:spec.videoTrack,audioTrack:spec.audioTrack});if(spec.at===undefined||spec.at===null){if(duration===null)throw new Error("Sequential assembly requires sourceOut for every clip or explicit at");cursor+=duration;}}return JSON.stringify({success:true,sequence:seq.name,placed:placed,end:cursor});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function timelineEdit(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "");
  const sequence = optionalString(params, "sequence");
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');';
  if (operation === "move") {
    const time = Math.max(0, finiteNumber(params.time));
    body += 'var clip=__clip(seq,' + js(target) + ');var before=__sec(clip.start);clip.move(' + js(time) + '-before);return JSON.stringify({success:true,operation:"move",before:before,after:__sec(clip.start)});';
  } else if (operation === "delete") {
    const ripple = params.ripple === true;
    body += 'var clip=__clip(seq,' + js(target) + ');var name=clip.name;clip.remove(' + (ripple ? "true" : "false") + ',true);return JSON.stringify({success:true,operation:"delete",name:name,ripple:' + (ripple ? "true" : "false") + '});';
  } else if (operation === "trim") {
    const sourceIn = params.sourceIn === undefined ? undefined : Math.max(0, finiteNumber(params.sourceIn));
    const sourceOut = params.sourceOut === undefined ? undefined : Math.max(0, finiteNumber(params.sourceOut));
    const duration = params.duration === undefined ? undefined : Math.max(0.001, finiteNumber(params.duration));
    if (sourceOut !== undefined && duration !== undefined) throw new Error("sourceOut_and_duration_conflict");
    body += 'var clip=__clip(seq,' + js(target) + ');var before={start:__sec(clip.start),end:__sec(clip.end),inPoint:__sec(clip.inPoint),outPoint:__sec(clip.outPoint)};';
    if (sourceIn !== undefined) body += 'clip.inPoint=__time(' + js(sourceIn) + ');';
    if (sourceOut !== undefined) body += 'clip.outPoint=__time(' + js(sourceOut) + ');';
    if (duration !== undefined) body += 'clip.end=__time(__sec(clip.start)+' + js(duration) + ');';
    body += 'return JSON.stringify({success:true,operation:"trim",before:before,after:{start:__sec(clip.start),end:__sec(clip.end),inPoint:__sec(clip.inPoint),outPoint:__sec(clip.outPoint)}});';
  } else if (operation === "razor") {
    const time = Math.max(0, finiteNumber(params.time));
    const fps = Math.max(1, finiteNumber(params.fps, 30));
    const allTracks = params.allTracks === true;
    const trackType = typeof target.trackType === "string" ? String(target.trackType).toLowerCase() : "video";
    const trackIndex = Math.max(0, integer(target.trackIndex, 0));
    body += 'try{app.enableQE();}catch(e){throw new Error("QE API unavailable: "+e);}var qseq=qe.project.getActiveSequence();if(!qseq)throw new Error("QE active sequence unavailable");var seconds=' + js(time) + ';var fps=' + js(fps) + ';var total=Math.max(0,Math.round(seconds*fps));function pad2(n){return n<10?"0"+n:String(n);}var ff=total%Math.round(fps);var whole=Math.floor(total/fps);var ss=whole%60;var mm=Math.floor(whole/60)%60;var hh=Math.floor(whole/3600);var tc=pad2(hh)+":"+pad2(mm)+":"+pad2(ss)+":"+pad2(ff);var cut=[];';
    if (allTracks) {
      body += 'for(var vi=0;vi<seq.videoTracks.numTracks;vi++){var qv=qseq.getVideoTrackAt(vi);if(qv){qv.razor(tc);cut.push("V"+(vi+1));}}for(var ai=0;ai<seq.audioTracks.numTracks;ai++){var qa=qseq.getAudioTrackAt(ai);if(qa){qa.razor(tc);cut.push("A"+(ai+1));}}';
    } else if (trackType === "audio") {
      body += 'if(' + trackIndex + '>=seq.audioTracks.numTracks)throw new Error("Audio track index out of range");var qa=qseq.getAudioTrackAt(' + trackIndex + ');if(!qa)throw new Error("QE audio track unavailable");qa.razor(tc);cut.push("A"+(' + trackIndex + '+1));';
    } else {
      body += 'if(' + trackIndex + '>=seq.videoTracks.numTracks)throw new Error("Video track index out of range");var qv=qseq.getVideoTrackAt(' + trackIndex + ');if(!qv)throw new Error("QE video track unavailable");qv.razor(tc);cut.push("V"+(' + trackIndex + '+1));';
    }
    body += 'return JSON.stringify({success:true,operation:"razor",seconds:seconds,timecode:tc,tracks:cut});';
  } else if (operation === "speed") {
    const speed = finiteNumber(params.speed, 1);
    if (speed <= 0) throw new Error("speed_must_be_positive");
    const ratio = speed > 10 ? speed / 100 : speed;
    const reverse = params.reverse === true;
    const maintainPitch = params.maintainPitch !== false;
    const ripple = params.ripple === true;
    body += 'var mapped=__qeClip(seq,' + js(target) + ');var origTicks=0;try{origTicks=Number(mapped.dom.duration.ticks);}catch(_){}var targetTicks=(origTicks>0?' + js(ratio) + '>0)?String(Math.round(origTicks/' + js(ratio) + ')):"";var result;try{result=mapped.qe.setSpeed(' + js(ratio) + ',targetTicks,' + (reverse ? "true" : "false") + ',' + (maintainPitch ? "true" : "false") + ',' + (ripple ? "true" : "false") + ');}catch(primary){result=mapped.qe.setSpeed(' + js(ratio) + ',"",' + (reverse ? "true" : "false") + ',' + (maintainPitch ? "true" : "false") + ',' + (ripple ? "true" : "false") + ');}return JSON.stringify({success:true,operation:"speed",ratio:' + js(ratio) + ',percent:' + js(ratio*100) + ',reverse:' + (reverse ? "true" : "false") + ',maintainPitch:' + (maintainPitch ? "true" : "false") + ',ripple:' + (ripple ? "true" : "false") + ',apiResult:String(result)});';
  } else if (operation === "setEnabled") {
    const enabled = params.enabled !== false;
    body += 'var clip=__clip(seq,' + js(target) + ');clip.disabled=' + (enabled ? "false" : "true") + ';return JSON.stringify({success:true,operation:"setEnabled",enabled:' + (enabled ? "true" : "false") + '});';
  } else {
    throw new Error("premiere.timeline.edit operation must be move, delete, trim, razor, speed or setEnabled");
  }
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function motionAnimate(params: Record<string, unknown>): Record<string, unknown> {
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const sequence = optionalString(params, "sequence");
  const keyframes = objectArray(params.keyframes);
  if (!keyframes.length) throw new Error("keyframes_required");
  const frames = keyframes.map((frame) => ({ time: Math.max(0, finiteNumber(frame.time)), component: typeof frame.component === "string" ? frame.component : "Motion", property: requireString(frame, "property"), value: frame.value }));
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');var clip=__clip(seq,' + js(target) + ');var frames=' + js(frames) + ';var changed=[];';
  body += 'for(var i=0;i<frames.length;i++){var f=frames[i];var comp=__component(clip,f.component);if(!comp)throw new Error("Component not found: "+f.component);var prop=__property(comp,f.property);if(!prop)throw new Error("Property not found: "+f.property);__setKey(prop,f.time,f.value);changed.push({time:f.time,component:f.component,property:f.property});}return JSON.stringify({success:true,changed:changed});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function audioMix(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "clip");
  const sequence = optionalString(params, "sequence");

  if (operation === "trackMute") {
    const trackIndex = Math.max(0, integer(params.trackIndex, 0));
    const muted = params.muted !== false;
    let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');if(' + trackIndex + '>=seq.audioTracks.numTracks)throw new Error("Audio track index out of range");var track=seq.audioTracks[' + trackIndex + '];if(!track.setMute)throw new Error("Track setMute API unavailable");track.setMute(' + (muted ? "1" : "0") + ');return JSON.stringify({success:true,operation:"trackMute",trackIndex:' + trackIndex + ',muted:' + (muted ? "true" : "false") + '});';
    return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
  }

  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const levelDb = params.levelDb === undefined ? undefined : finiteNumber(params.levelDb);
  const pan = params.pan === undefined ? undefined : Math.max(-100, Math.min(100, finiteNumber(params.pan)));
  const fade = Math.max(0, finiteNumber(params.fadeSeconds, 0.2));
  const baseDb = finiteNumber(params.baseDb, levelDb ?? 0);
  const supplied = objectArray(params.keyframes).map((frame) => ({ time: Math.max(0, finiteNumber(frame.time)), db: finiteNumber(frame.db) }));
  const windows = objectArray(params.duckingWindows).map((window) => ({
    start: Math.max(0, finiteNumber(window.start ?? window.startTime)),
    end: Math.max(0, finiteNumber(window.end ?? window.endTime)),
    db: finiteNumber(window.db ?? window.duckedDb, -18)
  }));
  const map = new Map<number, number>();
  const put = (time: number, db: number) => map.set(Math.round(Math.max(0, time) * 1000) / 1000, db);
  for (const frame of supplied) put(frame.time, frame.db);
  for (const window of windows) {
    if (window.end <= window.start) throw new Error("ducking_window_end_must_exceed_start");
    put(Math.max(0, window.start - fade), baseDb);
    put(window.start, window.db);
    put(window.end, window.db);
    put(window.end + fade, baseDb);
  }
  const frames = [...map.entries()].sort((a,b) => a[0]-b[0]).map(([time,db]) => ({ time, db }));
  if (levelDb === undefined && pan === undefined && !frames.length) throw new Error("levelDb_pan_keyframes_or_ducking_required");

  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');var clip=__clip(seq,' + js({ ...target, trackType: "audio" }) + ');var comp=__component(clip,"Volume");if(!comp)throw new Error("Volume component not found");var OFFSET=15;';
  if (levelDb !== undefined || frames.length) body += 'var prop=__property(comp,"Level");if(!prop)throw new Error("Volume Level property not found");';
  if (levelDb !== undefined) body += 'var linear=Math.pow(10,(' + js(levelDb) + '-OFFSET)/20);prop.setValue(linear,true);';
  if (frames.length) body += 'var frames=' + js(frames) + ';for(var i=0;i<frames.length;i++){var linearValue=Math.pow(10,(frames[i].db-OFFSET)/20);__setKey(prop,frames[i].time,linearValue);}';
  if (pan !== undefined) body += 'var panProp=__property(comp,"Pan");if(!panProp)throw new Error("Volume Pan property not found");panProp.setValue(' + js(pan) + ',true);';
  body += 'return JSON.stringify({success:true,operation:' + js(operation) + ',levelDb:' + (levelDb===undefined?"null":js(levelDb)) + ',pan:' + (pan===undefined?"null":js(pan)) + ',keyframes:' + js(frames) + ',duckingWindows:' + js(windows.length) + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function effectsApply(params: Record<string, unknown>): Record<string, unknown> {
  const sequence = optionalString(params, "sequence");
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const operation = String(params.operation ?? "effect");
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');';

  if (operation === "effect") {
    const name = requireString(params, "name");
    const values = params.parameters && typeof params.parameters === "object" ? params.parameters as Record<string, unknown> : {};
    body += 'var applied=__ensureVideoEffect(seq,' + js(target) + ',' + js(name) + ');var propertyResults=__setNamedProperties(applied.component,' + js(values) + ');return JSON.stringify({success:true,operation:"effect",effect:' + js(name) + ',properties:propertyResults});';
  } else if (operation === "transition") {
    const name = requireString(params, "name");
    const position = params.position === "start" ? "start" : "end";
    const duration = Math.max(0.01, finiteNumber(params.duration, 0.5));
    const trackType = typeof target.trackType === "string" ? target.trackType : "video";
    const targetWithType = { ...target, trackType };
    body += 'var mapped=__qeClip(seq,' + js(targetWithType) + ');var tr=' +
      (trackType === "audio" ? 'qe.project.getAudioTransitionByName(' : 'qe.project.getVideoTransitionByName(') + js(name) +
      ');if(!tr)throw new Error("Transition not found: "+' + js(name) + ');var fps=30;try{if(seq.timebase)fps=254016000000/parseInt(seq.timebase,10);}catch(_){}var frames=Math.max(1,Math.round(' + js(duration) + '*fps));mapped.qe.addTransition(tr,' + (position === "end" ? "true" : "false") + ',String(frames),"0",0.5,false,true);return JSON.stringify({success:true,operation:"transition",name:' + js(name) + ',position:' + js(position) + ',duration:' + js(duration) + ',frames:frames});';
  } else {
    throw new Error("premiere.effects.apply operation must be effect or transition");
  }
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function colorGrade(params: Record<string, unknown>): Record<string, unknown> {
  const sequence = optionalString(params, "sequence");
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const adjustments = params.adjustments && typeof params.adjustments === "object" ? params.adjustments as Record<string, unknown> : {};
  const lutPath = optionalString(params, "lutPath");
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');var applied=__ensureVideoEffect(seq,' + js({ ...target, trackType: "video" }) + ',"Lumetri Color");var values=' + js(adjustments) + ';var results=__setNamedProperties(applied.component,values);';
  if (lutPath) {
    body += 'var lutResult=__setNamedProperties(applied.component,{"Input LUT":' + js(lutPath) + '});for(var lr=0;lr<lutResult.length;lr++)results.push(lutResult[lr]);';
  }
  body += 'return JSON.stringify({success:true,effect:"Lumetri Color",adjustments:results,lutPath:' + (lutPath ? js(lutPath) : "null") + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function graphicsManage(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "importMogrt");
  if (operation !== "importMogrt") throw new Error("premiere.graphics.manage currently supports importMogrt");
  const sequence = optionalString(params, "sequence");
  const path = requireString(params, "mogrtPath");
  const time = Math.max(0, finiteNumber(params.time, 0));
  const videoTrack = Math.max(0, integer(params.videoTrack, 0));
  const audioTrack = Math.max(0, integer(params.audioTrack, 0));
  const values = params.properties && typeof params.properties === "object" ? params.properties as Record<string, unknown> : {};
  const texts = Array.isArray(params.texts) ? params.texts.filter((x): x is string => typeof x === "string") : [];
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');var file=new File(' + js(path) + ');if(!file.exists)throw new Error("MOGRT file not found");if(!seq.importMGT)throw new Error("Premiere importMGT API unavailable");var item=seq.importMGT(file.fsName,__ticks(' + js(time) + '),' + videoTrack + ',' + audioTrack + ');if(!item)throw new Error("MOGRT import failed");var component=null;try{if(item.getMGTComponent)component=item.getMGTComponent();}catch(_){}var writes=[];';
  body += 'if(component&&component.properties){var wanted=' + js(values) + ';writes=__setNamedProperties(component,wanted);var texts=' + js(texts) + ';if(texts.length){var candidates=[];for(var i=0;i<component.properties.numItems;i++){var p=component.properties[i],v=null;try{v=p.getValue();}catch(_){}var dn=__norm(p.displayName);if(dn.indexOf("sourcetext")>=0||dn==="text"||dn.indexOf("title")>=0||(typeof v==="string"&&(v.indexOf("mTextString")>=0||v.indexOf("mTextParam")>=0||v.indexOf("textEditValue")>=0)))candidates.push(p);}for(var ti=0;ti<texts.length&&ti<candidates.length;ti++){var prop=candidates[ti],raw=null;try{raw=prop.getValue();}catch(_){}var next=texts[ti],ok=false;try{if(typeof raw==="string"){var brace=raw.indexOf("{");if(brace>=0){var prefix=raw.substring(0,brace),obj=JSON.parse(raw.substring(brace));if(obj.mTextParam&&obj.mTextParam.mStyleSheet)obj.mTextParam.mStyleSheet.mText=next;else if(obj.mTextString!==undefined)obj.mTextString=next;else if(obj.textEditValue!==undefined)obj.textEditValue=next;else obj.mTextString=next;prop.setValue(prefix+JSON.stringify(obj),true);ok=true;}}if(!ok){prop.setValue(next,true);ok=true;}}catch(eText){writes.push({name:String(prop.displayName),ok:false,error:String(eText)});continue;}writes.push({name:String(prop.displayName),ok:ok,text:next});}}}return JSON.stringify({success:true,operation:"importMogrt",name:item.name,start:' + js(time) + ',videoTrack:' + videoTrack + ',writes:writes});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function captionsManage(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "importSrt");
  if (operation !== "importSrt") throw new Error("premiere.captions.manage currently supports importSrt");
  const sequence = optionalString(params, "sequence");
  const path = requireString(params, "path");
  const start = Math.max(0, finiteNumber(params.start, 0));
  const formatMap: Record<string, string> = {
    subtitle: "CAPTION_FORMAT_SUBTITLE", srt: "CAPTION_FORMAT_SUBTITLE",
    "608": "CAPTION_FORMAT_608", "cea-608": "CAPTION_FORMAT_608",
    "708": "CAPTION_FORMAT_708", "cea-708": "CAPTION_FORMAT_708",
    teletext: "CAPTION_FORMAT_TELETEXT", ebu: "CAPTION_FORMAT_OPEN_EBU",
    op42: "CAPTION_FORMAT_OP42", op47: "CAPTION_FORMAT_OP47"
  };
  const fmtName = formatMap[String(params.format ?? "subtitle").toLowerCase()] ?? "CAPTION_FORMAT_SUBTITLE";
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');var item=__ensureProjectItem(' + js(path) + ');if(!seq.createCaptionTrack)throw new Error("createCaptionTrack API unavailable");var fmt=null;try{if(typeof Sequence!=="undefined"&&Sequence[' + js(fmtName) + ']!==undefined)fmt=Sequence[' + js(fmtName) + '];else if(seq.constructor&&seq.constructor[' + js(fmtName) + ']!==undefined)fmt=seq.constructor[' + js(fmtName) + '];}catch(_){}var ok;if(fmt!==null&&fmt!==undefined){try{ok=seq.createCaptionTrack(item,' + js(start) + ',fmt);}catch(eFmt){ok=seq.createCaptionTrack(item,' + js(start) + ');}}else ok=seq.createCaptionTrack(item,' + js(start) + ');return JSON.stringify({success:ok!==false,operation:"importSrt",path:' + js(path) + ',start:' + js(start) + ',format:' + js(fmtName) + ',apiResult:String(ok)});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function timelineQa(params: Record<string, unknown>): Record<string, unknown> {
  const sequence = optionalString(params, "sequence");
  const minClip = Math.max(0, finiteNumber(params.minClipSeconds, 0.08));
  const gapTolerance = Math.max(0, finiteNumber(params.gapToleranceSeconds, 0.001));
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');var issues=[];var tracks=[];';
  body += 'for(var ti=0;ti<seq.videoTracks.numTracks;ti++){var tr=seq.videoTracks[ti];var clips=[];var prevEnd=null;for(var ci=0;ci<tr.clips.numItems;ci++){var cl=tr.clips[ci],s=__sec(cl.start),e=__sec(cl.end),d=e-s;clips.push({index:ci,nodeId:String(cl.nodeId),name:String(cl.name),start:s,end:e,duration:d});if(prevEnd!==null&&s-prevEnd>' + js(gapTolerance) + ')issues.push({type:"gap",trackType:"video",trackIndex:ti,start:prevEnd,end:s,duration:s-prevEnd});if(prevEnd!==null&&s<prevEnd-' + js(gapTolerance) + ')issues.push({type:"overlap",trackType:"video",trackIndex:ti,start:s,previousEnd:prevEnd,duration:prevEnd-s});if(d<' + js(minClip) + ')issues.push({type:"short_clip",trackType:"video",trackIndex:ti,clipIndex:ci,name:String(cl.name),duration:d});prevEnd=e;}tracks.push({trackType:"video",trackIndex:ti,clips:clips});}';
  body += 'for(var ai=0;ai<seq.audioTracks.numTracks;ai++){var atr=seq.audioTracks[ai];var aclips=[];for(var ac=0;ac<atr.clips.numItems;ac++){var al=atr.clips[ac],as=__sec(al.start),ae=__sec(al.end);aclips.push({index:ac,nodeId:String(al.nodeId),name:String(al.name),start:as,end:ae,duration:ae-as});}tracks.push({trackType:"audio",trackIndex:ai,clips:aclips});}return JSON.stringify({success:true,sequence:seq.name,sequenceID:String(seq.sequenceID),issueCount:issues.length,issues:issues,tracks:tracks});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function exportRender(params: Record<string, unknown>): Record<string, unknown> {
  const outputPath = requireString(params, "outputPath");
  const presetPath = requireString(params, "presetPath");
  const sequence = optionalString(params, "sequence");
  const startImmediately = params.startImmediately !== false;
  let body = HELPERS + 'var seq=__sequence(' + (sequence ? js(sequence) : "null") + ');var preset=new File(' + js(presetPath) + ');if(!preset.exists)throw new Error("Encoder preset file not found");var outFile=new File(' + js(outputPath) + ');if(outFile.parent&&!outFile.parent.exists)outFile.parent.create();if(!app.encoder||!app.encoder.encodeSequence)throw new Error("Adobe Media Encoder integration unavailable");try{app.encoder.launchEncoder();}catch(_){}var range=app.encoder.ENCODE_ENTIRE;var jobID=app.encoder.encodeSequence(seq,outFile.fsName,preset.fsName,range,1);if(!jobID)throw new Error("encodeSequence returned no job ID");';
  if (startImmediately) body += 'try{app.encoder.startBatch();}catch(_){}';
  body += 'return JSON.stringify({success:true,jobID:String(jobID),outputPath:outFile.fsName,presetPath:preset.fsName,started:' + (startImmediately ? "true" : "false") + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

export function compilePremiere(capability: string, params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.script === "string" && params.script) return params;
  switch (capability) {
    case "premiere.project.manage": return projectManage(params);
    case "premiere.timeline.assemble": return timelineAssemble(params);
    case "premiere.timeline.edit": return timelineEdit(params);
    case "premiere.motion.animate": return motionAnimate(params);
    case "premiere.effects.apply": return effectsApply(params);
    case "premiere.color.grade": return colorGrade(params);
    case "premiere.graphics.manage": return graphicsManage(params);
    case "premiere.captions.manage": return captionsManage(params);
    case "premiere.timeline.qa": return timelineQa(params);
    case "premiere.audio.mix": return audioMix(params);
    case "premiere.export.render": return exportRender(params);
    default: return params;
  }
}

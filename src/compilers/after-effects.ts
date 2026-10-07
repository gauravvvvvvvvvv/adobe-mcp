import { finiteNumber, integer, js, objectArray, optionalString, requireString, wrapScript } from "./common.js";

const HELPERS = [
'function __comp(name){if(name){for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item instanceof CompItem&&String(item.name)===String(name))return item;}}if(app.project.activeItem instanceof CompItem)return app.project.activeItem;throw new Error("Composition not found");}',
'function __layer(comp,spec){if(spec.index!==undefined){var idx=Number(spec.index);if(idx>=1&&idx<=comp.numLayers)return comp.layer(idx);}if(spec.name!==undefined){for(var i=1;i<=comp.numLayers;i++){if(String(comp.layer(i).name)===String(spec.name))return comp.layer(i);}}throw new Error("Layer not found");}',
'function __prop(root,path){var current=root;for(var i=0;i<path.length;i++){if(!current)throw new Error("Property path not found");var key=path[i];var next=null;try{next=current.property(key);}catch(_){}if(!next){try{next=current.property(Number(key));}catch(_){}}if(!next)throw new Error("Property not found: "+key);current=next;}return current;}',
'function __ease(prop,keyIndex,influence,speed){try{var dims=1;try{if(prop.value instanceof Array)dims=prop.value.length;}catch(_){}var easeIn=[],easeOut=[];for(var i=0;i<dims;i++){easeIn.push(new KeyframeEase(Number(speed||0),Number(influence||33)));easeOut.push(new KeyframeEase(Number(speed||0),Number(influence||33)));}prop.setTemporalEaseAtKey(keyIndex,easeIn,easeOut);}catch(_){}}'
].join("\n");

function compositionManage(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "");
  let body = HELPERS;
  if (operation === "create") {
    const name = requireString(params, "name");
    const width = Math.max(1, integer(params.width, 1920));
    const height = Math.max(1, integer(params.height, 1080));
    const duration = Math.max(0.01, finiteNumber(params.duration, 10));
    const frameRate = Math.max(1, finiteNumber(params.frameRate, 30));
    body += 'app.beginUndoGroup("Adobe MCP: create composition");var c=app.project.items.addComp(' + js(name) + ',' + width + ',' + height + ',1,' + duration + ',' + frameRate + ');app.endUndoGroup();return JSON.stringify({success:true,id:c.id,name:c.name,width:c.width,height:c.height,duration:c.duration,frameRate:c.frameRate});';
  } else if (operation === "duplicate") {
    const name = optionalString(params, "composition");
    const newName = optionalString(params, "name");
    body += 'var c=__comp(' + (name ? js(name) : "null") + ');app.beginUndoGroup("Adobe MCP: duplicate composition");var d=c.duplicate();';
    if (newName) body += 'd.name=' + js(newName) + ';';
    body += 'app.endUndoGroup();return JSON.stringify({success:true,id:d.id,name:d.name});';
  } else if (operation === "precompose") {
    const comp = optionalString(params, "composition");
    const indices = Array.isArray(params.layerIndices) ? params.layerIndices.map((x) => integer(x)).filter((x) => x > 0) : [];
    if (!indices.length) throw new Error("layerIndices_required");
    const name = requireString(params, "name");
    body += 'var c=__comp(' + (comp ? js(comp) : "null") + ');app.beginUndoGroup("Adobe MCP: precompose");var p=c.layers.precompose(' + js(indices) + ',' + js(name) + ',' + (params.moveAllAttributes !== false ? "true" : "false") + ');app.endUndoGroup();return JSON.stringify({success:true,name:p.name,id:p.id});';
  } else {
    throw new Error("after-effects.composition.manage operation must be create, duplicate or precompose");
  }
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function layersManage(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "");
  const comp = optionalString(params, "composition");
  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');app.beginUndoGroup("Adobe MCP: layer edit");var layer=null;';
  if (operation === "text") {
    body += 'layer=c.layers.addText(' + js(requireString(params, "text")) + ');';
    if (optionalString(params, "name")) body += 'layer.name=' + js(optionalString(params, "name")) + ';';
  } else if (operation === "solid") {
    const color = Array.isArray(params.color) ? params.color : [1,1,1];
    const name = optionalString(params, "name") ?? "Solid";
    const width = Math.max(1, integer(params.width, 1920));
    const height = Math.max(1, integer(params.height, 1080));
    body += 'layer=c.layers.addSolid(' + js(color) + ',' + js(name) + ',' + width + ',' + height + ',1,c.duration);';
  } else if (operation === "null") {
    body += 'layer=c.layers.addNull(c.duration);';
    if (optionalString(params, "name")) body += 'layer.name=' + js(optionalString(params, "name")) + ';';
  } else if (operation === "shape") {
    body += 'layer=c.layers.addShape();';
    if (optionalString(params, "name")) body += 'layer.name=' + js(optionalString(params, "name")) + ';';
  } else if (operation === "camera") {
    body += 'layer=c.layers.addCamera(' + js(optionalString(params, "name") ?? "Camera") + ',' + js(Array.isArray(params.center) ? params.center : [960,540]) + ');';
  } else if (operation === "light") {
    body += 'layer=c.layers.addLight(' + js(optionalString(params, "name") ?? "Light") + ',' + js(Array.isArray(params.center) ? params.center : [960,540]) + ');';
  } else if (operation === "duplicate") {
    const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
    body += 'layer=__layer(c,' + js(target) + ').duplicate();';
    if (optionalString(params, "name")) body += 'layer.name=' + js(optionalString(params, "name")) + ';';
  } else if (operation === "remove") {
    const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
    body += 'var target=__layer(c,' + js(target) + ');var oldName=target.name;target.remove();app.endUndoGroup();return JSON.stringify({success:true,removed:oldName});';
    return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
  } else {
    throw new Error("after-effects.layers.manage unsupported operation");
  }
  if (Array.isArray(params.position)) body += 'try{layer.property("ADBE Transform Group").property("ADBE Position").setValue(' + js(params.position) + ');}catch(_){}';
  if (params.threeDLayer === true) body += 'try{layer.threeDLayer=true;}catch(_){}';
  body += 'app.endUndoGroup();return JSON.stringify({success:true,index:layer.index,name:layer.name});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function propertiesAnimate(params: Record<string, unknown>): Record<string, unknown> {
  const comp = optionalString(params, "composition");
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const keyframes = objectArray(params.keyframes);
  if (!keyframes.length) throw new Error("keyframes_required");
  const frames = keyframes.map((frame) => ({
    time: Math.max(0, finiteNumber(frame.time)),
    path: Array.isArray(frame.path) ? frame.path.map(String) : [requireString(frame, "property")],
    value: frame.value,
    easeInfluence: frame.easeInfluence === undefined ? undefined : finiteNumber(frame.easeInfluence),
    easeSpeed: frame.easeSpeed === undefined ? undefined : finiteNumber(frame.easeSpeed)
  }));
  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');var l=__layer(c,' + js(target) + ');var frames=' + js(frames) + ';var changed=[];app.beginUndoGroup("Adobe MCP: animate");';
  body += 'for(var i=0;i<frames.length;i++){var f=frames[i];var p=__prop(l,f.path);p.setValueAtTime(f.time,f.value);var key=p.nearestKeyIndex(f.time);if(f.easeInfluence!==undefined)__ease(p,key,f.easeInfluence,f.easeSpeed);changed.push({time:f.time,path:f.path});}';
  body += 'app.endUndoGroup();return JSON.stringify({success:true,layer:l.name,changed:changed});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function textAnimate(params: Record<string, unknown>): Record<string, unknown> {
  const comp = optionalString(params, "composition");
  const text = requireString(params, "text");
  const name = optionalString(params, "name") ?? "Text";
  const position = Array.isArray(params.position) ? params.position : [960,540];
  const fontSize = Math.max(1, finiteNumber(params.fontSize, 96));
  const color = Array.isArray(params.color) ? params.color : [1,1,1];
  const start = Math.max(0, finiteNumber(params.start, 0));
  const duration = Math.max(0.01, finiteNumber(params.duration, 3));
  const animateIn = Math.max(0, Math.min(duration, finiteNumber(params.animateIn, 0.5)));
  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');app.beginUndoGroup("Adobe MCP: text");var l=c.layers.addText(' + js(text) + ');l.name=' + js(name) + ';l.startTime=' + start + ';l.outPoint=' + (start + duration) + ';';
  body += 'var tp=l.property("ADBE Text Properties").property("ADBE Text Document");var d=tp.value;d.fontSize=' + fontSize + ';d.fillColor=' + js(color) + ';tp.setValue(d);var tr=l.property("ADBE Transform Group");tr.property("ADBE Position").setValue(' + js(position) + ');var op=tr.property("ADBE Opacity");op.setValueAtTime(' + start + ',0);op.setValueAtTime(' + (start + animateIn) + ',100);var sc=tr.property("ADBE Scale");sc.setValueAtTime(' + start + ',[90,90]);sc.setValueAtTime(' + (start + animateIn) + ',[100,100]);app.endUndoGroup();return JSON.stringify({success:true,index:l.index,name:l.name});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function shapesDraw(params: Record<string, unknown>): Record<string, unknown> {
  const comp = optionalString(params, "composition");
  const shape = String(params.shape ?? "rectangle");
  const name = optionalString(params, "name") ?? "Shape";
  const size = Array.isArray(params.size) ? params.size : [300,300];
  const position = Array.isArray(params.position) ? params.position : [960,540];
  const fill = Array.isArray(params.fill) ? params.fill : [1,1,1];
  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');app.beginUndoGroup("Adobe MCP: shape");var l=c.layers.addShape();l.name=' + js(name) + ';var contents=l.property("ADBE Root Vectors Group");var group=contents.addProperty("ADBE Vector Group");var gc=group.property("ADBE Vectors Group");';
  if (shape === "ellipse") body += 'var path=gc.addProperty("ADBE Vector Shape - Ellipse");path.property("ADBE Vector Ellipse Size").setValue(' + js(size) + ');';
  else body += 'var path=gc.addProperty("ADBE Vector Shape - Rect");path.property("ADBE Vector Rect Size").setValue(' + js(size) + ');';
  body += 'var f=gc.addProperty("ADBE Vector Graphic - Fill");f.property("ADBE Vector Fill Color").setValue(' + js(fill) + ');l.property("ADBE Transform Group").property("ADBE Position").setValue(' + js(position) + ');app.endUndoGroup();return JSON.stringify({success:true,index:l.index,name:l.name,shape:' + js(shape) + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function renderQueue(params: Record<string, unknown>): Record<string, unknown> {
  const comp = optionalString(params, "composition");
  const outputPath = requireString(params, "outputPath");
  const renderTemplate = optionalString(params, "renderSettingsTemplate");
  const outputTemplate = optionalString(params, "outputModuleTemplate");
  const start = params.start !== false;
  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');var rq=app.project.renderQueue;var item=rq.items.add(c);';
  if (renderTemplate) body += 'item.applyTemplate(' + js(renderTemplate) + ');';
  body += 'var om=item.outputModule(1);';
  if (outputTemplate) body += 'om.applyTemplate(' + js(outputTemplate) + ');';
  body += 'var f=new File(' + js(outputPath) + ');if(f.parent&&!f.parent.exists)f.parent.create();om.file=f;';
  if (start) body += 'rq.render();';
  body += 'return JSON.stringify({success:true,composition:c.name,outputPath:f.fsName,started:' + (start ? "true" : "false") + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

export function compileAfterEffects(capability: string, params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.script === "string" && params.script) return params;
  switch (capability) {
    case "after-effects.composition.manage": return compositionManage(params);
    case "after-effects.layers.manage": return layersManage(params);
    case "after-effects.properties.animate": return propertiesAnimate(params);
    case "after-effects.text.animate": return textAnimate(params);
    case "after-effects.shapes.draw": return shapesDraw(params);
    case "after-effects.render.queue": return renderQueue(params);
    default: return params;
  }
}

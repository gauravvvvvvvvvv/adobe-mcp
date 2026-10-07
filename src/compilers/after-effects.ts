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
  } else if (operation === "footage") {
    const path = requireString(params, "path");
    body += 'var file=new File(' + js(path) + ');if(!file.exists)throw new Error("Footage file not found");var opts=new ImportOptions(file);var footage=app.project.importFile(opts);if(!footage)throw new Error("After Effects import failed");layer=c.layers.add(footage);';
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
  if (params.parent && typeof params.parent === "object") body += 'var parentLayer=__layer(c,' + js(params.parent) + ');try{layer.parent=parentLayer;}catch(e){throw new Error("Could not parent layer: "+e);}';
  if (params.moveBefore && typeof params.moveBefore === "object") body += 'layer.moveBefore(__layer(c,' + js(params.moveBefore) + '));';
  if (params.moveAfter && typeof params.moveAfter === "object") body += 'layer.moveAfter(__layer(c,' + js(params.moveAfter) + '));';
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
  const animator = params.animator && typeof params.animator === "object" && !Array.isArray(params.animator)
    ? params.animator as Record<string, unknown>
    : undefined;
  const selectorFrames = animator ? objectArray(animator.selectorKeyframes).map((frame) => ({
    time: Math.max(0, finiteNumber(frame.time)),
    start: frame.start === undefined ? undefined : finiteNumber(frame.start),
    end: frame.end === undefined ? undefined : finiteNumber(frame.end),
    offset: frame.offset === undefined ? undefined : finiteNumber(frame.offset)
  })) : [];

  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');app.beginUndoGroup("Adobe MCP: text");var l=c.layers.addText(' + js(text) + ');l.name=' + js(name) + ';l.startTime=' + start + ';l.outPoint=' + (start + duration) + ';';
  body += 'var textProps=l.property("ADBE Text Properties");var tp=textProps.property("ADBE Text Document");var d=tp.value;d.fontSize=' + fontSize + ';d.fillColor=' + js(color) + ';tp.setValue(d);var tr=l.property("ADBE Transform Group");tr.property("ADBE Position").setValue(' + js(position) + ');var op=tr.property("ADBE Opacity");op.setValueAtTime(' + start + ',0);op.setValueAtTime(' + (start + animateIn) + ',100);var sc=tr.property("ADBE Scale");sc.setValueAtTime(' + start + ',[90,90]);sc.setValueAtTime(' + (start + animateIn) + ',[100,100]);';

  if (animator) {
    const properties: Array<[string, unknown]> = [
      ["ADBE Text Opacity", animator.opacity],
      ["ADBE Text Position 3D", animator.position],
      ["ADBE Text Scale 3D", animator.scale],
      ["ADBE Text Rotation", animator.rotation],
      ["ADBE Text Tracking Amount", animator.tracking]
    ];
    body += 'var animators=textProps.property("ADBE Text Animators");if(!animators)throw new Error("Text animators group unavailable");var animatorGroup=animators.addProperty("ADBE Text Animator");animatorGroup.name=' + js(typeof animator.name === "string" ? animator.name : "Adobe MCP Animator") + ';var animatorProps=animatorGroup.property("ADBE Text Animator Properties");';
    for (const [matchName, value] of properties) {
      if (value !== undefined) {
        body += 'var ap=animatorProps.addProperty(' + js(matchName) + ');if(!ap)throw new Error("Could not add text animator property: "+' + js(matchName) + ');ap.setValue(' + js(value) + ');';
      }
    }
    const selectorStart = finiteNumber(animator.start, 0);
    const selectorEnd = finiteNumber(animator.end, 100);
    const selectorOffset = finiteNumber(animator.offset, 0);
    body += 'var selectors=animatorGroup.property("ADBE Text Selectors");if(!selectors)throw new Error("Text selector group unavailable");var selector=selectors.addProperty("ADBE Text Selector");if(!selector)throw new Error("Could not add range selector");var selStart=selector.property("ADBE Text Percent Start");var selEnd=selector.property("ADBE Text Percent End");var selOffset=selector.property("ADBE Text Percent Offset");if(selStart)selStart.setValue(' + js(selectorStart) + ');if(selEnd)selEnd.setValue(' + js(selectorEnd) + ');if(selOffset)selOffset.setValue(' + js(selectorOffset) + ');';
    if (selectorFrames.length) {
      body += 'var selectorFrames=' + js(selectorFrames) + ';for(var sfi=0;sfi<selectorFrames.length;sfi++){var sf=selectorFrames[sfi];if(sf.start!==undefined&&selStart)selStart.setValueAtTime(sf.time,sf.start);if(sf.end!==undefined&&selEnd)selEnd.setValueAtTime(sf.time,sf.end);if(sf.offset!==undefined&&selOffset)selOffset.setValueAtTime(sf.time,sf.offset);}';
    }
  }

  body += 'app.endUndoGroup();return JSON.stringify({success:true,index:l.index,name:l.name,nativeAnimator:' + (animator ? "true" : "false") + ',selectorKeyframes:' + selectorFrames.length + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function shapesDraw(params: Record<string, unknown>): Record<string, unknown> {
  const comp = optionalString(params, "composition");
  const shape = String(params.shape ?? "rectangle").toLowerCase();
  const name = optionalString(params, "name") ?? "Shape";
  const size = Array.isArray(params.size) ? params.size : [300,300];
  const position = Array.isArray(params.position) ? params.position : [960,540];
  const fill = Array.isArray(params.fill) ? params.fill : [1,1,1];
  const vertices = Array.isArray(params.vertices) ? params.vertices : [];
  const zeros = vertices.map(() => [0,0]);
  const inTangents = Array.isArray(params.inTangents) && params.inTangents.length === vertices.length ? params.inTangents : zeros;
  const outTangents = Array.isArray(params.outTangents) && params.outTangents.length === vertices.length ? params.outTangents : zeros;
  if ((shape === "path" || shape === "bezier") && vertices.length < 2) throw new Error("shape_vertices_min_2");

  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');app.beginUndoGroup("Adobe MCP: shape");var l=c.layers.addShape();l.name=' + js(name) + ';var contents=l.property("ADBE Root Vectors Group");var group=contents.addProperty("ADBE Vector Group");var gc=group.property("ADBE Vectors Group");';
  if (shape === "ellipse") {
    body += 'var path=gc.addProperty("ADBE Vector Shape - Ellipse");path.property("ADBE Vector Ellipse Size").setValue(' + js(size) + ');';
  } else if (shape === "path" || shape === "bezier") {
    body += 'var path=gc.addProperty("ADBE Vector Shape - Group");var shapeValue=new Shape();shapeValue.vertices=' + js(vertices) + ';shapeValue.inTangents=' + js(inTangents) + ';shapeValue.outTangents=' + js(outTangents) + ';shapeValue.closed=' + (params.closed !== false ? "true" : "false") + ';path.property("ADBE Vector Shape").setValue(shapeValue);';
  } else {
    body += 'var path=gc.addProperty("ADBE Vector Shape - Rect");path.property("ADBE Vector Rect Size").setValue(' + js(size) + ');';
  }

  if (params.fill !== false) {
    body += 'var f=gc.addProperty("ADBE Vector Graphic - Fill");f.property("ADBE Vector Fill Color").setValue(' + js(fill) + ');';
  }
  if (Array.isArray(params.stroke)) {
    body += 'var st=gc.addProperty("ADBE Vector Graphic - Stroke");st.property("ADBE Vector Stroke Color").setValue(' + js(params.stroke) + ');st.property("ADBE Vector Stroke Width").setValue(' + Math.max(0, finiteNumber(params.strokeWidth, 4)) + ');';
  }
  if (params.trim === true || (params.trim && typeof params.trim === "object")) {
    const trim = params.trim && typeof params.trim === "object" ? params.trim as Record<string, unknown> : {};
    body += 'var trm=gc.addProperty("ADBE Vector Filter - Trim");trm.property("ADBE Vector Trim Start").setValue(' + finiteNumber(trim.start, 0) + ');trm.property("ADBE Vector Trim End").setValue(' + finiteNumber(trim.end, 100) + ');trm.property("ADBE Vector Trim Offset").setValue(' + finiteNumber(trim.offset, 0) + ');';
  }
  if (params.repeater && typeof params.repeater === "object") {
    const rep = params.repeater as Record<string, unknown>;
    body += 'var rep=gc.addProperty("ADBE Vector Filter - Repeater");rep.property("ADBE Vector Repeater Copies").setValue(' + Math.max(1, finiteNumber(rep.copies, 3)) + ');var rt=rep.property("ADBE Vector Repeater Transform");';
    if (Array.isArray(rep.position)) body += 'rt.property("ADBE Vector Repeater Position").setValue(' + js(rep.position) + ');';
    if (rep.rotation !== undefined) body += 'rt.property("ADBE Vector Repeater Rotation").setValue(' + finiteNumber(rep.rotation) + ');';
    if (Array.isArray(rep.scale)) body += 'rt.property("ADBE Vector Repeater Scale").setValue(' + js(rep.scale) + ');';
  }
  body += 'l.property("ADBE Transform Group").property("ADBE Position").setValue(' + js(position) + ');app.endUndoGroup();return JSON.stringify({success:true,index:l.index,name:l.name,shape:' + js(shape) + ',vertices:' + vertices.length + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function masksMattes(params: Record<string, unknown>): Record<string, unknown> {
  const comp = optionalString(params, "composition");
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const operation = String(params.operation ?? "mask");
  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');var l=__layer(c,' + js(target) + ');app.beginUndoGroup("Adobe MCP: masks and mattes");';

  if (operation === "mask") {
    const vertices = Array.isArray(params.vertices) ? params.vertices : [];
    if (vertices.length < 3) throw new Error("mask_vertices_min_3");
    const zeros = vertices.map(() => [0,0]);
    const inTangents = Array.isArray(params.inTangents) && params.inTangents.length === vertices.length ? params.inTangents : zeros;
    const outTangents = Array.isArray(params.outTangents) && params.outTangents.length === vertices.length ? params.outTangents : zeros;
    const mode = String(params.mode ?? "add").toLowerCase();
    const modes: Record<string,string> = { add:"ADD", subtract:"SUBTRACT", intersect:"INTERSECT", none:"NONE", lighten:"LIGHTEN", darken:"DARKEN", difference:"DIFFERENCE" };
    const modeName = modes[mode] ?? "ADD";
    const feather = Array.isArray(params.feather) ? params.feather : [0,0];
    const opacity = Math.max(0, Math.min(100, finiteNumber(params.opacity, 100)));
    const expansion = finiteNumber(params.expansion, 0);
    body += 'var mg=l.property("ADBE Mask Parade");if(!mg)throw new Error("Layer has no mask group");var m=mg.addProperty("ADBE Mask Atom");m.name=' + js(optionalString(params,"name") ?? "Mask") + ';var sh=new Shape();sh.vertices=' + js(vertices) + ';sh.inTangents=' + js(inTangents) + ';sh.outTangents=' + js(outTangents) + ';sh.closed=' + (params.closed !== false ? "true" : "false") + ';m.property("ADBE Mask Shape").setValue(sh);try{m.maskMode=MaskMode.' + modeName + ';}catch(_){}try{m.property("ADBE Mask Feather").setValue(' + js(feather) + ');}catch(_){}try{m.property("ADBE Mask Opacity").setValue(' + opacity + ');}catch(_){}try{m.property("ADBE Mask Offset").setValue(' + expansion + ');}catch(_){}app.endUndoGroup();return JSON.stringify({success:true,operation:"mask",layer:l.name,mask:m.name,vertices:' + vertices.length + '});';
  } else if (operation === "trackMatte") {
    const matte = params.matte && typeof params.matte === "object" ? params.matte as Record<string, unknown> : {};
    const type = String(params.type ?? "alpha").toLowerCase();
    const types: Record<string,string> = { alpha:"ALPHA", alphaInverted:"ALPHA_INVERTED", "alpha-inverted":"ALPHA_INVERTED", luma:"LUMA", lumaInverted:"LUMA_INVERTED", "luma-inverted":"LUMA_INVERTED" };
    const typeName = types[type] ?? "ALPHA";
    body += 'var matte=__layer(c,' + js(matte) + ');if(l.setTrackMatte){l.setTrackMatte(matte,TrackMatteType.' + typeName + ');}else{try{matte.moveBefore(l);}catch(_){}l.trackMatteType=TrackMatteType.' + typeName + ';}app.endUndoGroup();return JSON.stringify({success:true,operation:"trackMatte",layer:l.name,matte:matte.name,type:' + js(typeName) + '});';
  } else if (operation === "removeTrackMatte") {
    body += 'if(l.removeTrackMatte)l.removeTrackMatte();else l.trackMatteType=TrackMatteType.NO_TRACK_MATTE;app.endUndoGroup();return JSON.stringify({success:true,operation:"removeTrackMatte",layer:l.name});';
  } else if (operation === "blendMode") {
    const requested = String(params.blendMode ?? params.mode ?? "normal").toLowerCase().replace(/[\s_-]+/g, "");
    const blendModes: Record<string,string> = {
      normal:"NORMAL", dissolve:"DISSOLVE", darken:"DARKEN", multiply:"MULTIPLY", colorburn:"COLOR_BURN",
      classiccolorburn:"CLASSIC_COLOR_BURN", linearburn:"LINEAR_BURN", darkercolor:"DARKER_COLOR",
      add:"ADD", lighten:"LIGHTEN", screen:"SCREEN", colordodge:"COLOR_DODGE", classiccolordodge:"CLASSIC_COLOR_DODGE",
      lineardodge:"LINEAR_DODGE", lightercolor:"LIGHTER_COLOR", overlay:"OVERLAY", softlight:"SOFT_LIGHT",
      hardlight:"HARD_LIGHT", linearlight:"LINEAR_LIGHT", vividlight:"VIVID_LIGHT", pinlight:"PIN_LIGHT",
      hardmix:"HARD_MIX", difference:"DIFFERENCE", classicdifference:"CLASSIC_DIFFERENCE", exclusion:"EXCLUSION",
      subtract:"SUBTRACT", divide:"DIVIDE", hue:"HUE", saturation:"SATURATION", color:"COLOR", luminosity:"LUMINOSITY",
      stencilalpha:"STENCIL_ALPHA", stencilluma:"STENCIL_LUMA", silhouettealpha:"SILHOUETTE_ALPHA", silhouetteluma:"SILHOUETTE_LUMA",
      alphaadd:"ALPHA_ADD", luminescentpremul:"LUMINESCENT_PREMUL"
    };
    const blendMode = blendModes[requested];
    if (!blendMode) throw new Error("unsupported_blend_mode:" + requested);
    body += 'l.blendingMode=BlendingMode.' + blendMode + ';app.endUndoGroup();return JSON.stringify({success:true,operation:"blendMode",layer:l.name,blendMode:' + js(blendMode) + '});';
  } else {
    throw new Error("after-effects.masks.mattes operation must be mask, trackMatte, removeTrackMatte or blendMode");
  }
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function effectsApply(params: Record<string, unknown>): Record<string, unknown> {
  const comp = optionalString(params, "composition");
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const operation = String(params.operation ?? "effect");
  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');var l=__layer(c,' + js(target) + ');app.beginUndoGroup("Adobe MCP: effect");';

  if (operation === "preset") {
    const path = requireString(params, "path");
    body += 'var f=new File(' + js(path) + ');if(!f.exists)throw new Error("Animation preset not found");if(!l.applyPreset)throw new Error("Layer applyPreset API unavailable");l.applyPreset(f);app.endUndoGroup();return JSON.stringify({success:true,operation:"preset",layer:l.name,path:f.fsName});';
  } else if (operation === "effect") {
    const name = requireString(params, "name");
    const values = params.parameters && typeof params.parameters === "object" ? params.parameters as Record<string, unknown> : {};
    body += 'var parade=l.property("ADBE Effect Parade");if(!parade)throw new Error("Effect parade unavailable");if(parade.canAddProperty&&!parade.canAddProperty(' + js(name) + '))throw new Error("Effect cannot be added: "+' + js(name) + ');var fx=parade.addProperty(' + js(name) + ');if(!fx)throw new Error("Effect add failed");var values=' + js(values) + ';var writes=[];for(var k in values){if(values.hasOwnProperty&&!values.hasOwnProperty(k))continue;var p=null;try{p=fx.property(k);}catch(_){}if(!p&&!isNaN(Number(k))){try{p=fx.property(Number(k));}catch(_){}}if(!p){writes.push({property:k,ok:false,error:"not_found"});continue;}try{p.setValue(values[k]);writes.push({property:k,ok:true});}catch(e){writes.push({property:k,ok:false,error:String(e)});}}app.endUndoGroup();return JSON.stringify({success:true,operation:"effect",layer:l.name,effect:fx.name,writes:writes});';
  } else if (operation === "remove") {
    const name = requireString(params, "name");
    body += 'var parade=l.property("ADBE Effect Parade");var removed=false;for(var i=parade.numProperties;i>=1;i--){var fx=parade.property(i);if(String(fx.name)===' + js(name) + '||String(fx.matchName)===' + js(name) + '){fx.remove();removed=true;break;}}if(!removed)throw new Error("Effect not found");app.endUndoGroup();return JSON.stringify({success:true,operation:"remove",name:' + js(name) + '});';
  } else {
    throw new Error("after-effects.effects.apply operation must be effect, preset or remove");
  }
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function threeDScene(params: Record<string, unknown>): Record<string, unknown> {
  const comp = optionalString(params, "composition");
  const operation = String(params.operation ?? "configure");
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  let body = HELPERS + 'var c=__comp(' + (comp ? js(comp) : "null") + ');app.beginUndoGroup("Adobe MCP: 3D scene");';

  if (operation === "configure") {
    body += 'var l=__layer(c,' + js(target) + ');l.threeDLayer=' + (params.enabled !== false ? "true" : "false") + ';var tr=l.property("ADBE Transform Group");';
    if (Array.isArray(params.position)) body += 'tr.property("ADBE Position").setValue(' + js(params.position) + ');';
    if (Array.isArray(params.orientation)) body += 'tr.property("ADBE Orientation").setValue(' + js(params.orientation) + ');';
    if (params.xRotation !== undefined) body += 'tr.property("ADBE Rotate X").setValue(' + finiteNumber(params.xRotation) + ');';
    if (params.yRotation !== undefined) body += 'tr.property("ADBE Rotate Y").setValue(' + finiteNumber(params.yRotation) + ');';
    if (params.zRotation !== undefined) body += 'tr.property("ADBE Rotate Z").setValue(' + finiteNumber(params.zRotation) + ');';
    if (params.parent && typeof params.parent === "object") body += 'l.parent=__layer(c,' + js(params.parent) + ');';
    if (params.motionBlur !== undefined) body += 'l.motionBlur=' + (params.motionBlur === true ? "true" : "false") + ';';
    body += 'app.endUndoGroup();return JSON.stringify({success:true,operation:"configure",layer:l.name,threeDLayer:l.threeDLayer});';
  } else if (operation === "camera") {
    const name = optionalString(params,"name") ?? "Camera";
    const center = Array.isArray(params.center) ? params.center : [960,540];
    body += 'var camera=c.layers.addCamera(' + js(name) + ',' + js(center) + ');';
    if (Array.isArray(params.position)) body += 'camera.property("ADBE Transform Group").property("ADBE Position").setValue(' + js(params.position) + ');';
    if (params.zoom !== undefined) body += 'try{camera.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(' + finiteNumber(params.zoom) + ');}catch(_){}';
    body += 'app.endUndoGroup();return JSON.stringify({success:true,operation:"camera",name:camera.name,index:camera.index});';
  } else if (operation === "light") {
    const name = optionalString(params,"name") ?? "Light";
    const center = Array.isArray(params.center) ? params.center : [960,540];
    body += 'var light=c.layers.addLight(' + js(name) + ',' + js(center) + ');';
    if (Array.isArray(params.position)) body += 'light.property("ADBE Transform Group").property("ADBE Position").setValue(' + js(params.position) + ');';
    if (params.intensity !== undefined) body += 'try{light.property("ADBE Light Options Group").property("ADBE Light Intensity").setValue(' + finiteNumber(params.intensity) + ');}catch(_){}';
    body += 'app.endUndoGroup();return JSON.stringify({success:true,operation:"light",name:light.name,index:light.index});';
  } else if (operation === "parent") {
    const parent = params.parent && typeof params.parent === "object" ? params.parent as Record<string, unknown> : {};
    body += 'var l=__layer(c,' + js(target) + ');var p=__layer(c,' + js(parent) + ');l.parent=p;app.endUndoGroup();return JSON.stringify({success:true,operation:"parent",layer:l.name,parent:p.name});';
  } else {
    throw new Error("after-effects.three-d.scene operation must be configure, camera, light or parent");
  }
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
    case "after-effects.masks.mattes": return masksMattes(params);
    case "after-effects.effects.apply": return effectsApply(params);
    case "after-effects.three-d.scene": return threeDScene(params);
    case "after-effects.render.queue": return renderQueue(params);
    default: return params;
  }
}

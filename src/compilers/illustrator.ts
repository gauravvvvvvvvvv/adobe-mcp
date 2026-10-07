import { finiteNumber, integer, js, optionalString, requireString, wrapScript } from "./common.js";

const HELPERS = [
'function __doc(){if(app.documents.length===0)throw new Error("No Illustrator document open");return app.activeDocument;}',
'function __rgb(value){var c=new RGBColor();c.red=Number(value[0]||0);c.green=Number(value[1]||0);c.blue=Number(value[2]||0);return c;}',
'function __item(doc,spec){if(spec.name){for(var i=0;i<doc.pageItems.length;i++){if(String(doc.pageItems[i].name)===String(spec.name))return doc.pageItems[i];}}if(spec.index!==undefined){var idx=Number(spec.index);if(idx>=0&&idx<doc.pageItems.length)return doc.pageItems[idx];}throw new Error("Illustrator item not found");}'
].join("\n");

function documentManage(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "");
  let body = HELPERS;

  if (operation === "create") {
    const width = Math.max(1, finiteNumber(params.width, 1920));
    const height = Math.max(1, finiteNumber(params.height, 1080));
    const colorSpace = String(params.colorSpace ?? "rgb").toLowerCase() === "cmyk"
      ? "DocumentColorSpace.CMYK"
      : "DocumentColorSpace.RGB";
    body += 'var d=app.documents.add(' + colorSpace + ',' + width + ',' + height + ');';
    body += 'return JSON.stringify({success:true,operation:"create",name:d.name,width:d.width,height:d.height,artboards:d.artboards.length});';
  } else if (operation === "open") {
    const path = requireString(params, "path");
    body += 'var f=new File(' + js(path) + ');if(!f.exists)throw new Error("Illustrator document not found");var d=app.open(f);return JSON.stringify({success:true,operation:"open",name:d.name,path:d.fullName?d.fullName.fsName:f.fsName,artboards:d.artboards.length});';
  } else if (operation === "save") {
    body += 'var d=__doc();d.save();return JSON.stringify({success:true,operation:"save",name:d.name,path:d.fullName?d.fullName.fsName:null});';
  } else if (operation === "saveAs") {
    const path = requireString(params, "path");
    body += 'var d=__doc();var f=new File(' + js(path) + ');if(f.parent&&!f.parent.exists)f.parent.create();d.saveAs(f);return JSON.stringify({success:true,operation:"saveAs",path:f.fsName});';
  } else if (operation === "close") {
    const save = params.save === true;
    body += 'var d=__doc();var name=d.name;var path=null;try{path=d.fullName.fsName;}catch(_){}d.close(' + (save ? "SaveOptions.SAVECHANGES" : "SaveOptions.DONOTSAVECHANGES") + ');return JSON.stringify({success:true,operation:"close",name:name,path:path,saved:' + (save ? "true" : "false") + '});';
  } else if (operation === "listArtboards") {
    body += 'var d=__doc();var list=[];for(var i=0;i<d.artboards.length;i++){var a=d.artboards[i];list.push({index:i,name:a.name,rect:a.artboardRect});}return JSON.stringify({success:true,operation:"listArtboards",active:d.artboards.getActiveArtboardIndex(),artboards:list});';
  } else if (operation === "addArtboard") {
    const rect = Array.isArray(params.rect) ? params.rect : [0,1080,1920,0];
    body += 'var d=__doc();var a=d.artboards.add(' + js(rect) + ');';
    if (typeof params.name === "string" && params.name) body += 'a.name=' + js(params.name) + ';';
    body += 'return JSON.stringify({success:true,operation:"addArtboard",index:d.artboards.length-1,name:a.name,rect:a.artboardRect});';
  } else if (operation === "setArtboard") {
    const index = Math.max(0, integer(params.index, 0));
    body += 'var d=__doc();if(' + index + '>=d.artboards.length)throw new Error("Artboard index out of range");var a=d.artboards[' + index + '];';
    if (Array.isArray(params.rect)) body += 'a.artboardRect=' + js(params.rect) + ';';
    if (typeof params.name === "string" && params.name) body += 'a.name=' + js(params.name) + ';';
    if (params.activate === true) body += 'd.artboards.setActiveArtboardIndex(' + index + ');';
    body += 'return JSON.stringify({success:true,operation:"setArtboard",index:' + index + ',name:a.name,rect:a.artboardRect,active:d.artboards.getActiveArtboardIndex()});';
  } else if (operation === "activateArtboard") {
    const index = Math.max(0, integer(params.index, 0));
    body += 'var d=__doc();if(' + index + '>=d.artboards.length)throw new Error("Artboard index out of range");d.artboards.setActiveArtboardIndex(' + index + ');return JSON.stringify({success:true,operation:"activateArtboard",index:' + index + ',name:d.artboards[' + index + '].name});';
  } else if (operation === "removeArtboard") {
    const index = Math.max(0, integer(params.index, 0));
    body += 'var d=__doc();if(d.artboards.length<=1)throw new Error("Illustrator requires at least one artboard");if(' + index + '>=d.artboards.length)throw new Error("Artboard index out of range");var name=d.artboards[' + index + '].name;d.artboards[' + index + '].remove();return JSON.stringify({success:true,operation:"removeArtboard",index:' + index + ',name:name,remaining:d.artboards.length});';
  } else {
    throw new Error("illustrator.document.manage operation must be create, open, save, saveAs, close, listArtboards, addArtboard, setArtboard, activateArtboard or removeArtboard");
  }

  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function vectorCreate(params: Record<string, unknown>): Record<string, unknown> {
  const shape = String(params.shape ?? "rectangle").toLowerCase();
  const name = optionalString(params, "name") ?? "Artwork";
  const fill = Array.isArray(params.fill) ? params.fill : [0,0,0];
  const fillEnabled = params.fill !== false;
  const stroke = Array.isArray(params.stroke) ? params.stroke : null;
  const strokeWidth = Math.max(0, finiteNumber(params.strokeWidth, 1));

  const normalizePath = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("path_object_required");
    const spec = value as Record<string, unknown>;
    const rawPoints = Array.isArray(spec.points) ? spec.points : [];
    if (rawPoints.length < 2) throw new Error("points_required");
    const anchors: unknown[] = [];
    const left: unknown[] = [];
    const right: unknown[] = [];
    const smooth: boolean[] = [];
    for (const raw of rawPoints) {
      if (Array.isArray(raw)) {
        if (raw.length < 2) throw new Error("path_point_requires_xy");
        const anchor = [finiteNumber(raw[0]), finiteNumber(raw[1])];
        anchors.push(anchor); left.push(anchor); right.push(anchor); smooth.push(false);
      } else if (raw && typeof raw === "object") {
        const point = raw as Record<string, unknown>;
        const anchorRaw = Array.isArray(point.anchor) ? point.anchor : [point.x, point.y];
        const anchor = [finiteNumber(anchorRaw[0]), finiteNumber(anchorRaw[1])];
        const leftRaw = Array.isArray(point.leftDirection) ? point.leftDirection : anchor;
        const rightRaw = Array.isArray(point.rightDirection) ? point.rightDirection : anchor;
        anchors.push(anchor);
        left.push([finiteNumber(leftRaw[0]), finiteNumber(leftRaw[1])]);
        right.push([finiteNumber(rightRaw[0]), finiteNumber(rightRaw[1])]);
        smooth.push(point.smooth === true || String(point.pointType ?? "").toLowerCase() === "smooth");
      } else {
        throw new Error("invalid_path_point");
      }
    }
    return { anchors, left, right, smooth, closed: spec.closed === true };
  };

  let body = HELPERS +
    'function __setPath(path,spec){path.setEntirePath(spec.anchors);path.closed=spec.closed;for(var pi=0;pi<path.pathPoints.length;pi++){var pp=path.pathPoints[pi];pp.leftDirection=spec.left[pi];pp.rightDirection=spec.right[pi];pp.pointType=spec.smooth[pi]?PointType.SMOOTH:PointType.CORNER;}return path;}' +
    'var d=__doc();var item=null;';

  if (shape === "rectangle") {
    const x=finiteNumber(params.x,0), y=finiteNumber(params.y,1000), w=Math.max(0.1,finiteNumber(params.width,200)), h=Math.max(0.1,finiteNumber(params.height,200));
    body += 'item=d.pathItems.rectangle(' + y + ',' + x + ',' + w + ',' + h + ');';
  } else if (shape === "ellipse") {
    const x=finiteNumber(params.x,0), y=finiteNumber(params.y,1000), w=Math.max(0.1,finiteNumber(params.width,200)), h=Math.max(0.1,finiteNumber(params.height,200));
    body += 'item=d.pathItems.ellipse(' + y + ',' + x + ',' + w + ',' + h + ');';
  } else if (shape === "polygon") {
    const cx=finiteNumber(params.centerX,500), cy=finiteNumber(params.centerY,500), radius=Math.max(0.1,finiteNumber(params.radius,100)), sides=Math.max(3,integer(params.sides,6));
    body += 'item=d.pathItems.polygon(' + cy + ',' + cx + ',' + radius + ',' + sides + ');';
  } else if (shape === "path" || shape === "bezier") {
    const pathSpec = normalizePath({ ...params, points: params.points, closed: params.closed });
    body += 'item=__setPath(d.pathItems.add(),' + js(pathSpec) + ');';
  } else if (shape === "compound") {
    const paths = Array.isArray(params.paths) ? params.paths : [];
    if (paths.length < 2) throw new Error("compound_paths_min_2");
    const specs = paths.map(normalizePath);
    body += 'var compound=d.activeLayer.compoundPathItems.add();var pathSpecs=' + js(specs) + ';for(var ci=0;ci<pathSpecs.length;ci++){__setPath(compound.pathItems.add(),pathSpecs[ci]);}item=compound;';
  } else if (shape === "clippinggroup" || shape === "clipping-group") {
    const clipTarget = params.clipTarget && typeof params.clipTarget === "object" && !Array.isArray(params.clipTarget)
      ? params.clipTarget as Record<string, unknown>
      : undefined;
    const contents = Array.isArray(params.contents)
      ? params.contents.filter((value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value))
      : [];
    if (!clipTarget || !contents.length) throw new Error("clipTarget_and_contents_required");
    body += 'var clip=__item(d,' + js(clipTarget) + ');if(clip.typename!=="PathItem"&&clip.typename!=="CompoundPathItem")throw new Error("Clipping path must be a path or compound path");var contentSpecs=' + js(contents) + ';var contentItems=[];for(var gi=0;gi<contentSpecs.length;gi++)contentItems.push(__item(d,contentSpecs[gi]));var group=d.groupItems.add();for(var gm=contentItems.length-1;gm>=0;gm--)contentItems[gm].move(group,ElementPlacement.PLACEATEND);clip.move(group,ElementPlacement.PLACEATBEGINNING);if(clip.typename==="PathItem")clip.clipping=true;else if(clip.pathItems.length)clip.pathItems[0].clipping=true;group.clipped=true;item=group;';
  } else {
    throw new Error("illustrator.vector.create shape must be rectangle, ellipse, polygon, path, bezier, compound or clippingGroup");
  }

  body += 'item.name=' + js(name) + ';';
  if (shape !== "clippinggroup" && shape !== "clipping-group") {
    body += 'var styleTarget=item.typename==="CompoundPathItem"&&item.pathItems.length?item.pathItems[0]:item;';
    if (fillEnabled) body += 'if(styleTarget.filled!==undefined){styleTarget.filled=true;styleTarget.fillColor=__rgb(' + js(fill) + ');}';
    else body += 'if(styleTarget.filled!==undefined)styleTarget.filled=false;';
    if (stroke) body += 'if(styleTarget.stroked!==undefined){styleTarget.stroked=true;styleTarget.strokeColor=__rgb(' + js(stroke) + ');styleTarget.strokeWidth=' + strokeWidth + ';}';
    else body += 'if(styleTarget.stroked!==undefined)styleTarget.stroked=false;';
  }
  body += 'return JSON.stringify({success:true,name:item.name,typename:item.typename,shape:' + js(shape) + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function vectorTransform(params: Record<string, unknown>): Record<string, unknown> {
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const operation = String(params.operation ?? "");
  let body = HELPERS + 'var d=__doc();';

  if (operation === "align" || operation === "distribute") {
    const specs = Array.isArray(params.targets)
      ? params.targets.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
      : [target];
    if (!specs.length) throw new Error("targets_required");
    body += 'var specs=' + js(specs) + ';var items=[];for(var si=0;si<specs.length;si++)items.push(__item(d,specs[si]));';

    if (operation === "align") {
      const mode = String(params.mode ?? "center");
      const reference = String(params.reference ?? "selection");
      body += 'var left,top,right,bottom;';
      if (reference === "artboard") {
        body += 'var ar=d.artboards[d.artboards.getActiveArtboardIndex()].artboardRect;left=ar[0];top=ar[1];right=ar[2];bottom=ar[3];';
      } else {
        body += 'var b0=items[0].geometricBounds;left=b0[0];top=b0[1];right=b0[2];bottom=b0[3];for(var bi=1;bi<items.length;bi++){var bb=items[bi].geometricBounds;if(bb[0]<left)left=bb[0];if(bb[1]>top)top=bb[1];if(bb[2]>right)right=bb[2];if(bb[3]<bottom)bottom=bb[3];}';
      }
      body += 'var mode=' + js(mode) + ';var moved=[];for(var ai=0;ai<items.length;ai++){var it=items[ai],b=it.geometricBounds,dx=0,dy=0;if(mode==="left")dx=left-b[0];else if(mode==="right")dx=right-b[2];else if(mode==="hCenter"||mode==="center")dx=((left+right)/2)-((b[0]+b[2])/2);if(mode==="top")dy=top-b[1];else if(mode==="bottom")dy=bottom-b[3];else if(mode==="vCenter"||mode==="center")dy=((top+bottom)/2)-((b[1]+b[3])/2);it.translate(dx,dy);moved.push({name:it.name,dx:dx,dy:dy});}return JSON.stringify({success:true,operation:"align",mode:mode,reference:' + js(reference) + ',moved:moved});';
    } else {
      const direction = String(params.direction ?? "horizontal");
      body += 'if(items.length<3)return JSON.stringify({success:true,operation:"distribute",changed:false,count:items.length});var direction=' + js(direction) + ';';
      body += 'if(direction==="vertical"){items.sort(function(a,b){return b.geometricBounds[1]-a.geometricBounds[1];});var top=items[0].geometricBounds[1],bottom=items[items.length-1].geometricBounds[3],total=0;for(var vi=0;vi<items.length;vi++){var vb=items[vi].geometricBounds;total+=vb[1]-vb[3];}var gap=((top-bottom)-total)/(items.length-1),cursor=top;for(var v=0;v<items.length;v++){var item=items[v],b=item.geometricBounds,h=b[1]-b[3];item.translate(0,cursor-b[1]);cursor-=h+gap;}}else{items.sort(function(a,b){return a.geometricBounds[0]-b.geometricBounds[0];});var left=items[0].geometricBounds[0],right=items[items.length-1].geometricBounds[2],total=0;for(var hi=0;hi<items.length;hi++){var hb=items[hi].geometricBounds;total+=hb[2]-hb[0];}var gap=((right-left)-total)/(items.length-1),cursor=left;for(var h=0;h<items.length;h++){var item=items[h],b=item.geometricBounds,w=b[2]-b[0];item.translate(cursor-b[0],0);cursor+=w+gap;}}return JSON.stringify({success:true,operation:"distribute",direction:direction,count:items.length,gap:gap});';
    }
    return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
  }

  body += 'var item=__item(d,' + js(target) + ');';
  if (operation === "move") body += 'item.translate(' + finiteNumber(params.dx,0) + ',' + finiteNumber(params.dy,0) + ');';
  else if (operation === "rotate") body += 'item.rotate(' + finiteNumber(params.degrees,0) + ',true,true,true,true,Transformation.CENTER);';
  else if (operation === "scale") body += 'item.resize(' + finiteNumber(params.xPercent,100) + ',' + finiteNumber(params.yPercent,finiteNumber(params.xPercent,100)) + ',true,true,true,true,' + finiteNumber(params.strokePercent,100) + ',Transformation.CENTER);';
  else if (operation === "zOrder") {
    const action = String(params.action ?? "front");
    const map: Record<string,string> = { front:"BRINGTOFRONT", forward:"BRINGFORWARD", backward:"SENDBACKWARD", back:"SENDTOBACK" };
    body += 'item.zOrder(ZOrderMethod.' + (map[action] ?? "BRINGTOFRONT") + ');';
  } else throw new Error("illustrator.vector.transform operation must be move, rotate, scale, align, distribute or zOrder");
  body += 'return JSON.stringify({success:true,name:item.name,operation:' + js(operation) + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function appearanceStyle(params: Record<string, unknown>): Record<string, unknown> {
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const fill = Array.isArray(params.fill) ? params.fill : null;
  const stroke = Array.isArray(params.stroke) ? params.stroke : null;
  const opacity = params.opacity === undefined ? undefined : Math.max(0, Math.min(100, finiteNumber(params.opacity)));
  const blendName = typeof params.blendMode === "string"
    ? params.blendMode.toLowerCase().replace(/[\s_-]+/g, "")
    : undefined;
  const blendModes: Record<string,string> = {
    normal:"NORMAL", multiply:"MULTIPLY", screen:"SCREEN", overlay:"OVERLAY",
    softlight:"SOFTLIGHT", hardlight:"HARDLIGHT", colordodge:"COLORDODGE",
    colorburn:"COLORBURN", darken:"DARKEN", lighten:"LIGHTEN",
    difference:"DIFFERENCE", exclusion:"EXCLUSION", hue:"HUE",
    saturation:"SATURATION", color:"COLOR", luminosity:"LUMINOSITY"
  };
  if (blendName && !blendModes[blendName]) throw new Error("unsupported_blend_mode:" + blendName);

  let body = HELPERS + 'var d=__doc();var item=__item(d,' + js(target) + ');';

  if (typeof params.graphicStyleName === "string" && params.graphicStyleName) {
    body += 'var gs=d.graphicStyles.getByName(' + js(params.graphicStyleName) + ');gs.applyTo(item);';
  }

  if (params.fill === false) body += 'if(item.filled!==undefined)item.filled=false;';
  else if (fill) body += 'if(item.filled!==undefined){item.filled=true;item.fillColor=__rgb(' + js(fill) + ');}';

  if (params.gradient && typeof params.gradient === "object") {
    const gradient = params.gradient as Record<string, unknown>;
    const stops = Array.isArray(gradient.stops)
      ? gradient.stops.filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && !Array.isArray(s))
      : [];
    if (stops.length < 2) throw new Error("gradient_requires_at_least_two_stops");
    const normalizedStops = stops.map((stop, index) => ({
      rampPoint: Math.max(0, Math.min(100, finiteNumber(stop.rampPoint, index * (100 / Math.max(1, stops.length - 1))))),
      midPoint: Math.max(13, Math.min(87, finiteNumber(stop.midPoint, 50))),
      color: Array.isArray(stop.color) ? stop.color : [0,0,0]
    }));
    body += 'var grad=d.gradients.add();grad.name=' + js(typeof gradient.name === "string" ? gradient.name : "Adobe MCP Gradient") + ';grad.type=' + (String(gradient.type ?? "linear").toLowerCase()==="radial" ? "GradientType.RADIAL" : "GradientType.LINEAR") + ';var stops=' + js(normalizedStops) + ';while(grad.gradientStops.length<stops.length)grad.gradientStops.add();for(var gi=0;gi<stops.length;gi++){var gsx=grad.gradientStops[gi];gsx.rampPoint=stops[gi].rampPoint;gsx.midPoint=stops[gi].midPoint;gsx.color=__rgb(stops[gi].color);}var gc=new GradientColor();gc.gradient=grad;';
    if (gradient.angle !== undefined) body += 'try{gc.angle=' + finiteNumber(gradient.angle) + ';}catch(_){}';
    body += 'if(item.filled!==undefined){item.filled=true;item.fillColor=gc;}';
  }

  if (typeof params.patternName === "string" && params.patternName) {
    body += 'var pattern=d.patterns.getByName(' + js(params.patternName) + ');var pc=new PatternColor();pc.pattern=pattern;';
    if (params.patternRotation !== undefined) body += 'pc.rotation=' + finiteNumber(params.patternRotation) + ';';
    if (params.patternScale !== undefined) body += 'pc.scaleFactor=[' + finiteNumber(params.patternScale,100) + ',' + finiteNumber(params.patternScale,100) + '];';
    body += 'if(item.filled!==undefined){item.filled=true;item.fillColor=pc;}';
  }

  if (params.stroke === false) body += 'if(item.stroked!==undefined)item.stroked=false;';
  else if (stroke) body += 'if(item.stroked!==undefined){item.stroked=true;item.strokeColor=__rgb(' + js(stroke) + ');}';
  if (params.strokeWidth !== undefined) body += 'if(item.strokeWidth!==undefined)item.strokeWidth=' + Math.max(0, finiteNumber(params.strokeWidth)) + ';';

  if (typeof params.strokeCap === "string") {
    const cap = String(params.strokeCap).toLowerCase();
    const capMap: Record<string,string> = { butt:"BUTTENDCAP", round:"ROUNDENDCAP", projecting:"PROJECTINGENDCAP", square:"PROJECTINGENDCAP" };
    if (!capMap[cap]) throw new Error("unsupported_stroke_cap:" + cap);
    body += 'if(item.strokeCap!==undefined)item.strokeCap=StrokeCap.' + capMap[cap] + ';';
  }
  if (typeof params.strokeJoin === "string") {
    const joinName = String(params.strokeJoin).toLowerCase();
    const joinMap: Record<string,string> = { miter:"MITERENDJOIN", round:"ROUNDENDJOIN", bevel:"BEVELENDJOIN" };
    if (!joinMap[joinName]) throw new Error("unsupported_stroke_join:" + joinName);
    body += 'if(item.strokeJoin!==undefined)item.strokeJoin=StrokeJoin.' + joinMap[joinName] + ';';
  }
  if (params.strokeMiterLimit !== undefined) body += 'if(item.strokeMiterLimit!==undefined)item.strokeMiterLimit=' + Math.max(1, finiteNumber(params.strokeMiterLimit)) + ';';
  if (Array.isArray(params.strokeDashes)) body += 'if(item.strokeDashes!==undefined)item.strokeDashes=' + js(params.strokeDashes.map((x) => Math.max(0, finiteNumber(x)))) + ';';
  if (params.strokeDashOffset !== undefined) body += 'if(item.strokeDashOffset!==undefined)item.strokeDashOffset=' + finiteNumber(params.strokeDashOffset) + ';';

  if (opacity !== undefined) body += 'item.opacity=' + opacity + ';';
  if (blendName) body += 'item.blendingMode=BlendModes.' + blendModes[blendName] + ';';

  if (typeof params.liveEffectXml === "string" && params.liveEffectXml.trim()) {
    body += 'if(!item.applyEffect)throw new Error("PageItem.applyEffect unavailable");item.applyEffect(' + js(params.liveEffectXml) + ');';
  }

  body += 'return JSON.stringify({success:true,name:item.name,typename:item.typename,opacity:item.opacity,blendMode:String(item.blendingMode),fillType:item.fillColor?item.fillColor.typename:null,strokeWidth:item.strokeWidth!==undefined?item.strokeWidth:null});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function textManage(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "create");
  const mode = String(params.mode ?? "point").toLowerCase();
  const target = params.target && typeof params.target === "object" && !Array.isArray(params.target)
    ? params.target as Record<string, unknown>
    : {};
  const orientation = String(params.orientation ?? "horizontal").toLowerCase() === "vertical"
    ? "TextOrientation.VERTICAL"
    : "TextOrientation.HORIZONTAL";

  const style = {
    font: typeof params.font === "string" ? params.font : undefined,
    size: params.fontSize === undefined ? undefined : Math.max(1, finiteNumber(params.fontSize)),
    color: Array.isArray(params.color) ? params.color : undefined,
    tracking: params.tracking === undefined ? undefined : finiteNumber(params.tracking),
    leading: params.leading === undefined ? undefined : Math.max(0, finiteNumber(params.leading)),
    baselineShift: params.baselineShift === undefined ? undefined : finiteNumber(params.baselineShift),
    horizontalScale: params.horizontalScale === undefined ? undefined : Math.max(1, finiteNumber(params.horizontalScale)),
    verticalScale: params.verticalScale === undefined ? undefined : Math.max(1, finiteNumber(params.verticalScale)),
    strokeColor: Array.isArray(params.strokeColor) ? params.strokeColor : undefined,
    strokeWeight: params.strokeWeight === undefined ? undefined : Math.max(0, finiteNumber(params.strokeWeight))
  };

  const ranges = Array.isArray(params.ranges)
    ? params.ranges.filter((value): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value))
      .map((range) => ({
        start: Math.max(0, integer(range.start, 0)),
        length: Math.max(0, integer(range.length, 1)),
        font: typeof range.font === "string" ? range.font : undefined,
        size: range.fontSize === undefined ? undefined : Math.max(1, finiteNumber(range.fontSize)),
        color: Array.isArray(range.color) ? range.color : undefined,
        tracking: range.tracking === undefined ? undefined : finiteNumber(range.tracking),
        leading: range.leading === undefined ? undefined : Math.max(0, finiteNumber(range.leading)),
        baselineShift: range.baselineShift === undefined ? undefined : finiteNumber(range.baselineShift),
        horizontalScale: range.horizontalScale === undefined ? undefined : Math.max(1, finiteNumber(range.horizontalScale)),
        verticalScale: range.verticalScale === undefined ? undefined : Math.max(1, finiteNumber(range.verticalScale))
      }))
    : [];

  let body = HELPERS +
    'function __charStyle(range,s){var ca=range.characterAttributes;if(s.font!==undefined)ca.textFont=app.textFonts.getByName(s.font);if(s.size!==undefined)ca.size=s.size;if(s.color!==undefined)ca.fillColor=__rgb(s.color);if(s.tracking!==undefined)ca.tracking=s.tracking;if(s.leading!==undefined){ca.autoLeading=false;ca.leading=s.leading;}if(s.baselineShift!==undefined)ca.baselineShift=s.baselineShift;if(s.horizontalScale!==undefined)ca.horizontalScale=s.horizontalScale;if(s.verticalScale!==undefined)ca.verticalScale=s.verticalScale;if(s.strokeColor!==undefined)ca.strokeColor=__rgb(s.strokeColor);if(s.strokeWeight!==undefined)ca.strokeWeight=s.strokeWeight;}' +
    'var d=__doc();var t=null;';

  if (operation === "create") {
    const text = requireString(params, "text");
    const name = optionalString(params, "name") ?? "Text";
    if (mode === "area") {
      if (params.pathTarget && typeof params.pathTarget === "object" && !Array.isArray(params.pathTarget)) {
        body += 'var textPath=__item(d,' + js(params.pathTarget) + ');if(textPath.typename!=="PathItem")throw new Error("Area text pathTarget must be a PathItem");t=d.textFrames.areaText(textPath,' + orientation + ');';
      } else {
        const x = finiteNumber(params.x,0), y = finiteNumber(params.y,500);
        const width = Math.max(1, finiteNumber(params.width,400)), height = Math.max(1, finiteNumber(params.height,200));
        body += 'var textPath=d.pathItems.rectangle(' + y + ',' + x + ',' + width + ',' + height + ');t=d.textFrames.areaText(textPath,' + orientation + ');';
      }
    } else if (mode === "path") {
      if (params.pathTarget && typeof params.pathTarget === "object" && !Array.isArray(params.pathTarget)) {
        body += 'var textPath=__item(d,' + js(params.pathTarget) + ');if(textPath.typename!=="PathItem")throw new Error("Path text pathTarget must be a PathItem");t=d.textFrames.pathText(textPath,undefined,undefined,' + orientation + ');';
      } else {
        const points = Array.isArray(params.points) ? params.points : [];
        if (points.length < 2) throw new Error("path_text_points_required");
        body += 'var textPath=d.pathItems.add();textPath.setEntirePath(' + js(points) + ');t=d.textFrames.pathText(textPath,undefined,undefined,' + orientation + ');';
      }
    } else {
      body += 't=d.textFrames.add();t.position=' + js([finiteNumber(params.x,0), finiteNumber(params.y,0)]) + ';';
    }
    body += 't.name=' + js(name) + ';t.contents=' + js(text) + ';';
  } else if (operation === "update") {
    body += 't=__item(d,' + js(target) + ');if(t.typename!=="TextFrame")throw new Error("Target is not a TextFrame");';
    if (typeof params.text === "string") body += 't.contents=' + js(params.text) + ';';
  } else {
    throw new Error("illustrator.text.manage operation must be create or update");
  }

  body += 'var baseStyle=' + js(style) + ';__charStyle(t.textRange,baseStyle);';

  if (typeof params.justification === "string") {
    const justification = String(params.justification).toLowerCase().replace(/[\s_-]+/g,"");
    const map: Record<string,string> = {
      left:"LEFT", right:"RIGHT", center:"CENTER", fulljustify:"FULLJUSTIFY",
      fulljustifylastlineleft:"FULLJUSTIFYLASTLINELEFT",
      fulljustifylastlinecenter:"FULLJUSTIFYLASTLINECENTER",
      fulljustifylastlineright:"FULLJUSTIFYLASTLINERIGHT"
    };
    if (!map[justification]) throw new Error("unsupported_justification:" + justification);
    body += 't.textRange.paragraphAttributes.justification=Justification.' + map[justification] + ';';
  }

  if (ranges.length) {
    body += 'var ranges=' + js(ranges) + ';for(var ri=0;ri<ranges.length;ri++){var rs=ranges[ri],end=Math.min(t.characters.length,rs.start+rs.length);for(var ci=rs.start;ci<end;ci++){__charStyle(t.characters[ci],rs);}}';
  }

  if (params.rotate !== undefined) body += 't.rotate(' + finiteNumber(params.rotate) + ',true,true,true,true,Transformation.CENTER);';
  body += 'return JSON.stringify({success:true,operation:' + js(operation) + ',mode:' + js(mode) + ',name:t.name,contents:t.contents,characters:t.characters.length});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function symbolsPatterns(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "createSymbol");
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  let body = HELPERS + 'var d=__doc();';

  if (operation === "list") {
    body += 'var symbols=[],patterns=[],brushes=[];for(var si=0;si<d.symbols.length;si++)symbols.push(d.symbols[si].name);for(var pi=0;pi<d.patterns.length;pi++)patterns.push(d.patterns[pi].name);for(var bi=0;bi<d.brushes.length;bi++)brushes.push(d.brushes[bi].name);return JSON.stringify({success:true,operation:"list",symbols:symbols,patterns:patterns,brushes:brushes});';
  } else if (operation === "createSymbol") {
    const name = requireString(params, "name");
    body += 'var item=__item(d,' + js(target) + ');var sym=d.symbols.add(item);sym.name=' + js(name) + ';return JSON.stringify({success:true,operation:"createSymbol",name:sym.name});';
  } else if (operation === "placeSymbol") {
    const name = requireString(params, "name");
    const position = Array.isArray(params.position) ? params.position : [0,0];
    body += 'var sym=d.symbols.getByName(' + js(name) + ');var instance=d.symbolItems.add(sym);instance.position=' + js(position) + ';';
    if (params.scale !== undefined) body += 'instance.resize(' + finiteNumber(params.scale,100) + ',' + finiteNumber(params.scale,100) + ',true,true,true,true,' + finiteNumber(params.scale,100) + ',Transformation.CENTER);';
    body += 'return JSON.stringify({success:true,operation:"placeSymbol",name:instance.name,symbol:sym.name,position:instance.position});';
  } else if (operation === "applyPattern") {
    const patternName = requireString(params, "patternName");
    body += 'var item=__item(d,' + js(target) + ');var pattern=d.patterns.getByName(' + js(patternName) + ');var pc=new PatternColor();pc.pattern=pattern;';
    if (params.rotation !== undefined) body += 'pc.rotation=' + finiteNumber(params.rotation) + ';';
    if (params.scaleFactor !== undefined) body += 'pc.scaleFactor=[' + finiteNumber(params.scaleFactor,100) + ',' + finiteNumber(params.scaleFactor,100) + '];';
    body += 'item.filled=true;item.fillColor=pc;return JSON.stringify({success:true,operation:"applyPattern",item:item.name,pattern:pattern.name});';
  } else if (operation === "applyBrush") {
    const brushName = requireString(params, "brushName");
    body += 'var item=__item(d,' + js(target) + ');var brush=d.brushes.getByName(' + js(brushName) + ');brush.applyTo(item);return JSON.stringify({success:true,operation:"applyBrush",item:item.name,brush:brush.name});';
  } else if (operation === "removeSymbol") {
    const name = requireString(params, "name");
    body += 'var sym=d.symbols.getByName(' + js(name) + ');sym.remove();return JSON.stringify({success:true,operation:"removeSymbol",name:' + js(name) + '});';
  } else if (operation === "removePattern") {
    const name = requireString(params, "name");
    body += 'var pattern=d.patterns.getByName(' + js(name) + ');pattern.remove();return JSON.stringify({success:true,operation:"removePattern",name:' + js(name) + '});';
  } else {
    throw new Error("illustrator.symbols.patterns operation must be list, createSymbol, placeSymbol, applyPattern, applyBrush, removeSymbol or removePattern");
  }
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function imageTrace(params: Record<string, unknown>): Record<string, unknown> {
  const path = requireString(params, "path");
  const preset = optionalString(params, "preset");
  const expand = params.expand !== false;
  const mode = String(params.mode ?? "color").toLowerCase();
  let body = HELPERS + 'var d=__doc();var file=new File(' + js(path) + ');if(!file.exists)throw new Error("Trace source not found");var placed=d.placedItems.add();placed.file=file;';
  if (Array.isArray(params.position)) body += 'placed.position=' + js(params.position) + ';';
  body += 'var plugin=placed.trace();if(!plugin||!plugin.tracing)throw new Error("Image trace failed to start");var options=plugin.tracing.tracingOptions;';
  if (preset) body += 'if(!options.loadFromPreset(' + js(preset) + '))throw new Error("Tracing preset could not be loaded");';
  body += 'options.tracingMode=' + (mode==="bw"||mode==="blackandwhite" ? "TracingModeType.TRACINGMODEBLACKANDWHITE" : mode==="gray"||mode==="grayscale" ? "TracingModeType.TRACINGMODEGRAY" : "TracingModeType.TRACINGMODECOLOR") + ';';
  if (params.maxColors !== undefined) body += 'options.maxColors=' + Math.max(2,Math.min(256,integer(params.maxColors,16))) + ';';
  if (params.threshold !== undefined) body += 'options.threshold=' + Math.max(0,Math.min(255,integer(params.threshold,128))) + ';';
  if (params.ignoreWhite !== undefined) body += 'options.ignoreWhite=' + (params.ignoreWhite === true ? "true" : "false") + ';';
  if (params.pathFitting !== undefined) body += 'options.pathFitting=' + Math.max(0,Math.min(10,finiteNumber(params.pathFitting,2))) + ';';
  body += 'app.redraw();var result=plugin;';
  if (expand) body += 'result=plugin.tracing.expandTracing(false);';
  body += 'return JSON.stringify({success:true,expanded:' + (expand ? "true" : "false") + ',typename:result.typename,name:result.name||null});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function exportAssets(params: Record<string, unknown>): Record<string, unknown> {
  const path = requireString(params, "path");
  const format = String(params.format ?? "png").toLowerCase();
  let body = HELPERS + 'var d=__doc();var f=new File(' + js(path) + ');if(f.parent&&!f.parent.exists)f.parent.create();';
  if (format === "png") body += 'var o=new ExportOptionsPNG24();o.antiAliasing=true;o.transparency=' + (params.transparency !== false ? "true" : "false") + ';d.exportFile(f,ExportType.PNG24,o);';
  else if (format === "jpg" || format === "jpeg") body += 'var o=new ExportOptionsJPEG();o.qualitySetting=' + Math.max(0,Math.min(100,integer(params.quality,90))) + ';d.exportFile(f,ExportType.JPEG,o);';
  else if (format === "svg") body += 'var o=new ExportOptionsSVG();d.exportFile(f,ExportType.SVG,o);';
  else if (format === "pdf") {
    body += 'var o=new PDFSaveOptions();o.preserveEditability=' + (params.preserveEditability !== false ? "true" : "false") + ';';
    if (typeof params.preset === "string" && params.preset) body += 'o.pDFPreset=' + js(params.preset) + ';';
    body += 'd.saveAs(f,o);';
  }
  else throw new Error("illustrator.export.assets format must be png, jpg, svg or pdf");
  body += 'return JSON.stringify({success:true,path:f.fsName,format:' + js(format) + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

export function compileIllustrator(capability: string, params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.script === "string" && params.script) return params;
  switch (capability) {
    case "illustrator.document.manage": return documentManage(params);
    case "illustrator.vector.create": return vectorCreate(params);
    case "illustrator.vector.transform": return vectorTransform(params);
    case "illustrator.appearance.style": return appearanceStyle(params);
    case "illustrator.text.manage": return textManage(params);
    case "illustrator.symbols.patterns": return symbolsPatterns(params);
    case "illustrator.image.trace": return imageTrace(params);
    case "illustrator.export.assets": return exportAssets(params);
    default: return params;
  }
}

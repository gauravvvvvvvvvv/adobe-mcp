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
    body += 'var d=app.documents.add(DocumentColorSpace.RGB,' + width + ',' + height + ');return JSON.stringify({success:true,name:d.name,width:d.width,height:d.height});';
  } else if (operation === "saveAs") {
    const path = requireString(params, "path");
    body += 'var d=__doc();var f=new File(' + js(path) + ');if(f.parent&&!f.parent.exists)f.parent.create();d.saveAs(f);return JSON.stringify({success:true,path:f.fsName});';
  } else if (operation === "addArtboard") {
    const rect = Array.isArray(params.rect) ? params.rect : [0,1080,1920,0];
    body += 'var d=__doc();var a=d.artboards.add(' + js(rect) + ');return JSON.stringify({success:true,index:d.artboards.length-1,rect:a.artboardRect});';
  } else {
    throw new Error("illustrator.document.manage operation must be create, saveAs or addArtboard");
  }
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function vectorCreate(params: Record<string, unknown>): Record<string, unknown> {
  const shape = String(params.shape ?? "rectangle");
  const name = optionalString(params, "name") ?? "Artwork";
  const fill = Array.isArray(params.fill) ? params.fill : [0,0,0];
  const stroke = Array.isArray(params.stroke) ? params.stroke : null;
  const strokeWidth = Math.max(0, finiteNumber(params.strokeWidth, 1));
  let body = HELPERS + 'var d=__doc();var item=null;';
  if (shape === "rectangle") {
    const x=finiteNumber(params.x,0), y=finiteNumber(params.y,1000), w=Math.max(0.1,finiteNumber(params.width,200)), h=Math.max(0.1,finiteNumber(params.height,200));
    body += 'item=d.pathItems.rectangle(' + y + ',' + x + ',' + w + ',' + h + ');';
  } else if (shape === "ellipse") {
    const x=finiteNumber(params.x,0), y=finiteNumber(params.y,1000), w=Math.max(0.1,finiteNumber(params.width,200)), h=Math.max(0.1,finiteNumber(params.height,200));
    body += 'item=d.pathItems.ellipse(' + y + ',' + x + ',' + w + ',' + h + ');';
  } else if (shape === "polygon") {
    const cx=finiteNumber(params.centerX,500), cy=finiteNumber(params.centerY,500), radius=Math.max(0.1,finiteNumber(params.radius,100)), sides=Math.max(3,integer(params.sides,6));
    body += 'item=d.pathItems.polygon(' + cy + ',' + cx + ',' + radius + ',' + sides + ');';
  } else if (shape === "path") {
    const points = Array.isArray(params.points) ? params.points : [];
    if (points.length < 2) throw new Error("points_required");
    body += 'item=d.pathItems.add();item.setEntirePath(' + js(points) + ');item.closed=' + (params.closed === true ? "true" : "false") + ';';
  } else {
    throw new Error("illustrator.vector.create shape must be rectangle, ellipse, polygon or path");
  }
  body += 'item.name=' + js(name) + ';item.filled=true;item.fillColor=__rgb(' + js(fill) + ');';
  if (stroke) body += 'item.stroked=true;item.strokeColor=__rgb(' + js(stroke) + ');item.strokeWidth=' + strokeWidth + ';';
  else body += 'item.stroked=false;';
  body += 'return JSON.stringify({success:true,name:item.name,typename:item.typename});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function vectorTransform(params: Record<string, unknown>): Record<string, unknown> {
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const operation = String(params.operation ?? "");
  let body = HELPERS + 'var d=__doc();var item=__item(d,' + js(target) + ');';
  if (operation === "move") body += 'item.translate(' + finiteNumber(params.dx,0) + ',' + finiteNumber(params.dy,0) + ');';
  else if (operation === "rotate") body += 'item.rotate(' + finiteNumber(params.degrees,0) + ',true,true,true,true,Transformation.CENTER);';
  else if (operation === "scale") body += 'item.resize(' + finiteNumber(params.xPercent,100) + ',' + finiteNumber(params.yPercent,finiteNumber(params.xPercent,100)) + ',true,true,true,true,' + finiteNumber(params.strokePercent,100) + ',Transformation.CENTER);';
  else throw new Error("illustrator.vector.transform operation must be move, rotate or scale");
  body += 'return JSON.stringify({success:true,name:item.name,operation:' + js(operation) + '});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function appearanceStyle(params: Record<string, unknown>): Record<string, unknown> {
  const target = params.target && typeof params.target === "object" ? params.target as Record<string, unknown> : {};
  const fill = Array.isArray(params.fill) ? params.fill : null;
  const stroke = Array.isArray(params.stroke) ? params.stroke : null;
  const opacity = params.opacity === undefined ? undefined : Math.max(0,Math.min(100,finiteNumber(params.opacity)));
  let body = HELPERS + 'var d=__doc();var item=__item(d,' + js(target) + ');';
  if (fill) body += 'item.filled=true;item.fillColor=__rgb(' + js(fill) + ');';
  if (stroke) body += 'item.stroked=true;item.strokeColor=__rgb(' + js(stroke) + ');item.strokeWidth=' + Math.max(0,finiteNumber(params.strokeWidth,1)) + ';';
  if (opacity !== undefined) body += 'item.opacity=' + opacity + ';';
  body += 'return JSON.stringify({success:true,name:item.name,opacity:item.opacity});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function textManage(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "create");
  if (operation !== "create") throw new Error("illustrator.text.manage currently supports create");
  const text = requireString(params, "text");
  const name = optionalString(params, "name") ?? "Text";
  const x = finiteNumber(params.x,0), y = finiteNumber(params.y,0), size = Math.max(1,finiteNumber(params.fontSize,72));
  const color = Array.isArray(params.color) ? params.color : [0,0,0];
  let body = HELPERS + 'var d=__doc();var t=d.textFrames.add();t.name=' + js(name) + ';t.contents=' + js(text) + ';t.position=[' + x + ',' + y + '];t.textRange.characterAttributes.size=' + size + ';t.textRange.characterAttributes.fillColor=__rgb(' + js(color) + ');return JSON.stringify({success:true,name:t.name,contents:t.contents});';
  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

function exportAssets(params: Record<string, unknown>): Record<string, unknown> {
  const path = requireString(params, "path");
  const format = String(params.format ?? "png").toLowerCase();
  let body = HELPERS + 'var d=__doc();var f=new File(' + js(path) + ');if(f.parent&&!f.parent.exists)f.parent.create();';
  if (format === "png") body += 'var o=new ExportOptionsPNG24();o.antiAliasing=true;o.transparency=' + (params.transparency !== false ? "true" : "false") + ';d.exportFile(f,ExportType.PNG24,o);';
  else if (format === "jpg" || format === "jpeg") body += 'var o=new ExportOptionsJPEG();o.qualitySetting=' + Math.max(0,Math.min(100,integer(params.quality,90))) + ';d.exportFile(f,ExportType.JPEG,o);';
  else if (format === "svg") body += 'var o=new ExportOptionsSVG();d.exportFile(f,ExportType.SVG,o);';
  else throw new Error("illustrator.export.assets format must be png, jpg or svg");
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
    case "illustrator.export.assets": return exportAssets(params);
    default: return params;
  }
}

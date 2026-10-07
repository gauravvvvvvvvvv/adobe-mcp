import { integer, js, optionalString, requireString, wrapScript } from "./common.js";

const HELPERS = [
  'function __thumb(path){var f=new File(path);if(!f.exists){var folder=new Folder(path);if(folder.exists)return new Thumbnail(folder);throw new Error("Bridge asset not found: "+path);}return new Thumbnail(f);}',
  'function __info(t){var md=null;try{md=t.synchronousMetadata?String(t.synchronousMetadata.serialize()):null;}catch(_){}return {name:t.name,type:t.type,uri:t.uri,spec:t.spec?t.spec.fsName:null,rating:t.rating,label:t.label,metadata:md};}'
].join("\n");

export function compileBridge(capability: string, params: Record<string, unknown>): Record<string, unknown> {
  if (typeof params.script === "string" && params.script) return params;
  if (capability !== "bridge.assets.manage") return params;

  const operation = String(params.operation ?? "selection");
  let body = HELPERS;

  if (operation === "selection") {
    body += 'var s=app.document?app.document.selections:[];var out=[];for(var i=0;i<s.length;i++)out.push(__info(s[i]));return JSON.stringify({success:true,operation:"selection",assets:out});';
  } else if (operation === "inspect") {
    const path = requireString(params, "path");
    body += 'var t=__thumb(' + js(path) + ');return JSON.stringify({success:true,operation:"inspect",asset:__info(t)});';
  } else if (operation === "rating") {
    const path = requireString(params, "path");
    const rating = Math.max(-1, Math.min(5, integer(params.rating, 0)));
    body += 'var t=__thumb(' + js(path) + ');t.rating=' + rating + ';return JSON.stringify({success:true,operation:"rating",path:t.spec?t.spec.fsName:null,rating:t.rating});';
  } else if (operation === "label") {
    const path = requireString(params, "path");
    const label = requireString(params, "label");
    body += 'var t=__thumb(' + js(path) + ');t.label=' + js(label) + ';return JSON.stringify({success:true,operation:"label",path:t.spec?t.spec.fsName:null,label:t.label});';
  } else if (operation === "copy" || operation === "move") {
    const path = requireString(params, "path");
    const destination = requireString(params, "destination");
    body += 'var t=__thumb(' + js(path) + ');var dest=new Folder(' + js(destination) + ');if(!dest.exists&& !dest.create())throw new Error("Could not create destination folder");var ok=t.' + (operation === "copy" ? "copyTo" : "moveTo") + '(dest);return JSON.stringify({success:ok!==false,operation:' + js(operation) + ',source:' + js(path) + ',destination:dest.fsName});';
  } else if (operation === "open") {
    const path = requireString(params, "path");
    body += 'var t=__thumb(' + js(path) + ');var ok=t.open();return JSON.stringify({success:ok!==false,operation:"open",path:t.spec?t.spec.fsName:null});';
  } else if (operation === "browse") {
    const path = requireString(params, "path");
    body += 'var t=__thumb(' + js(path) + ');if(t.type!=="folder")throw new Error("browse requires a folder");app.document.thumbnail=t;return JSON.stringify({success:true,operation:"browse",folder:t.spec?t.spec.fsName:null});';
  } else if (operation === "metadata") {
    const path = requireString(params, "path");
    body += 'var t=__thumb(' + js(path) + ');var md=t.synchronousMetadata;if(!md)throw new Error("Metadata unavailable");';
    const namespace = optionalString(params, "namespace");
    const property = optionalString(params, "property");
    if (namespace && property && params.value !== undefined) {
      body += 'md[' + js(namespace) + '] = md[' + js(namespace) + '] || {};md[' + js(namespace) + '][' + js(property) + ']=' + js(params.value) + ';t.synchronousMetadata=md;';
    }
    body += 'return JSON.stringify({success:true,operation:"metadata",path:t.spec?t.spec.fsName:null,serialized:String(md.serialize())});';
  } else {
    throw new Error("Unsupported bridge.assets.manage operation");
  }

  return { ...params, script: wrapScript(body), compiledBy: "adobe-mcp" };
}

import { finiteNumber, integer, js, optionalString, requireString, wrapScript } from "./common.js";

const HELPERS = [
  'function __doc(){if(app.documents.length===0)throw new Error("No InDesign document open");return app.activeDocument;}',
  'function __page(doc,index){var i=Number(index||0);if(i<0||i>=doc.pages.length)throw new Error("InDesign page index out of range");return doc.pages.item(i);}',
  'function __frame(doc,spec){if(spec.name){var named=doc.pageItems.itemByName(String(spec.name));if(named&&named.isValid)return named;}if(spec.id!==undefined){try{var item=doc.pageItems.itemByID(Number(spec.id));if(item&&item.isValid)return item;}catch(_){}}throw new Error("InDesign page item not found");}',
  'function __ensureParent(file){try{if(file.parent&&!file.parent.exists)file.parent.create();}catch(_){}}'
].join("\n");

function layout(params: Record<string, unknown>): Record<string, unknown> {
  const operation = String(params.operation ?? "");
  let body = HELPERS;

  if (operation === "createDocument") {
    body += 'var d=app.documents.add();';
    if (params.pageWidth !== undefined) body += 'd.documentPreferences.pageWidth=' + finiteNumber(params.pageWidth) + ';';
    if (params.pageHeight !== undefined) body += 'd.documentPreferences.pageHeight=' + finiteNumber(params.pageHeight) + ';';
    if (params.facingPages !== undefined) body += 'd.documentPreferences.facingPages=' + (params.facingPages === true ? "true" : "false") + ';';
    if (params.pages !== undefined) body += 'while(d.pages.length<' + Math.max(1,integer(params.pages,1)) + ')d.pages.add();';
    body += 'return JSON.stringify({success:true,operation:"createDocument",name:d.name,pages:d.pages.length,pageWidth:String(d.documentPreferences.pageWidth),pageHeight:String(d.documentPreferences.pageHeight)});';
  } else if (operation === "open") {
    const path = requireString(params,"path");
    body += 'var f=new File(' + js(path) + ');if(!f.exists)throw new Error("InDesign file not found");var d=app.open(f,' + (params.showWindow !== false ? "true" : "false") + ');return JSON.stringify({success:true,operation:"open",name:d.name,path:d.fullName.fsName,pages:d.pages.length});';
  } else if (operation === "saveAs") {
    const path=requireString(params,"path");
    body += 'var d=__doc();var f=new File(' + js(path) + ');__ensureParent(f);d.save(f);return JSON.stringify({success:true,operation:"saveAs",path:f.fsName});';
  } else if (operation === "addPage") {
    body += 'var d=__doc();var p=d.pages.add();return JSON.stringify({success:true,operation:"addPage",index:p.documentOffset,name:p.name});';
  } else if (operation === "textFrame") {
    const bounds=Array.isArray(params.bounds)?params.bounds:[20,20,120,180];
    const contents=typeof params.contents==="string"?params.contents:"";
    const page=Math.max(0,integer(params.page,0));
    const name=optionalString(params,"name");
    body += 'var d=__doc();var p=__page(d,'+page+');var tf=p.textFrames.add({geometricBounds:'+js(bounds)+',contents:'+js(contents)+'});';
    if(name) body += 'tf.name='+js(name)+';';
    if(typeof params.paragraphStyle==="string") body += 'var ps=d.paragraphStyles.itemByName('+js(params.paragraphStyle)+');if(ps&&ps.isValid)tf.parentStory.paragraphs.everyItem().appliedParagraphStyle=ps;';
    if(params.columns!==undefined) body += 'tf.textFramePreferences.textColumnCount='+Math.max(1,integer(params.columns,1))+';';
    if(params.inset!==undefined) body += 'tf.textFramePreferences.insetSpacing='+js(params.inset)+';';
    body += 'return JSON.stringify({success:true,operation:"textFrame",id:tf.id,name:tf.name||null,page:'+page+',contentsLength:String(tf.contents).length});';
  } else if (operation === "imageFrame") {
    const bounds=Array.isArray(params.bounds)?params.bounds:[20,20,120,180];
    const page=Math.max(0,integer(params.page,0));
    const path=requireString(params,"path");
    const name=optionalString(params,"name");
    body += 'var d=__doc();var p=__page(d,'+page+');var f=new File('+js(path)+');if(!f.exists)throw new Error("Placed image not found");var r=p.rectangles.add({geometricBounds:'+js(bounds)+'});';
    if(name) body += 'r.name='+js(name)+';';
    body += 'var placed=r.place(f);';
    const fit=String(params.fit??"proportional").toLowerCase();
    if(fit==="fill") body += 'r.fit(FitOptions.FILL_PROPORTIONALLY);';
    else if(fit==="center") body += 'r.fit(FitOptions.CENTER_CONTENT);';
    else body += 'r.fit(FitOptions.PROPORTIONALLY);r.fit(FitOptions.CENTER_CONTENT);';
    body += 'return JSON.stringify({success:true,operation:"imageFrame",id:r.id,name:r.name||null,page:'+page+',path:f.fsName,placedCount:placed?placed.length:0});';
  } else if (operation === "paragraphStyle") {
    const name=requireString(params,"name");
    body += 'var d=__doc();var s=d.paragraphStyles.itemByName('+js(name)+');if(!s||!s.isValid)s=d.paragraphStyles.add({name:'+js(name)+'});';
    if(typeof params.font==="string") body += 's.appliedFont='+js(params.font)+';';
    if(typeof params.fontStyle==="string") body += 's.fontStyle='+js(params.fontStyle)+';';
    if(params.pointSize!==undefined) body += 's.pointSize='+finiteNumber(params.pointSize)+';';
    if(params.leading!==undefined) body += 's.leading='+finiteNumber(params.leading)+';';
    if(params.tracking!==undefined) body += 's.tracking='+finiteNumber(params.tracking)+';';
    if(params.spaceBefore!==undefined) body += 's.spaceBefore='+finiteNumber(params.spaceBefore)+';';
    if(params.spaceAfter!==undefined) body += 's.spaceAfter='+finiteNumber(params.spaceAfter)+';';
    if(params.leftIndent!==undefined) body += 's.leftIndent='+finiteNumber(params.leftIndent)+';';
    if(params.firstLineIndent!==undefined) body += 's.firstLineIndent='+finiteNumber(params.firstLineIndent)+';';
    if(typeof params.justification==="string") {
      const map:Record<string,string>={left:"LEFT_ALIGN",right:"RIGHT_ALIGN",center:"CENTER_ALIGN",justify:"FULLY_JUSTIFIED"};
      body += 's.justification=Justification.'+(map[String(params.justification).toLowerCase()]??"LEFT_ALIGN")+';';
    }
    body += 'return JSON.stringify({success:true,operation:"paragraphStyle",name:s.name,pointSize:String(s.pointSize)});';
  } else if (operation === "characterStyle") {
    const name=requireString(params,"name");
    body += 'var d=__doc();var s=d.characterStyles.itemByName('+js(name)+');if(!s||!s.isValid)s=d.characterStyles.add({name:'+js(name)+'});';
    if(typeof params.font==="string") body += 's.appliedFont='+js(params.font)+';';
    if(typeof params.fontStyle==="string") body += 's.fontStyle='+js(params.fontStyle)+';';
    if(params.pointSize!==undefined) body += 's.pointSize='+finiteNumber(params.pointSize)+';';
    if(params.tracking!==undefined) body += 's.tracking='+finiteNumber(params.tracking)+';';
    body += 'return JSON.stringify({success:true,operation:"characterStyle",name:s.name});';
  } else if (operation === "linkFrames") {
    const from=params.from&&typeof params.from==="object"?params.from as Record<string,unknown>:{};
    const to=params.to&&typeof params.to==="object"?params.to as Record<string,unknown>:{};
    body += 'var d=__doc();var a=__frame(d,'+js(from)+'),b=__frame(d,'+js(to)+');if(!a.hasOwnProperty("nextTextFrame")&&!a.nextTextFrame===undefined)throw new Error("Source item is not a text frame");a.nextTextFrame=b;return JSON.stringify({success:true,operation:"linkFrames",from:a.name||a.id,to:b.name||b.id});';
  } else if (operation === "applyStyle") {
    const target=params.target&&typeof params.target==="object"?params.target as Record<string,unknown>:{};
    const paragraph=optionalString(params,"paragraphStyle");
    const character=optionalString(params,"characterStyle");
    body += 'var d=__doc();var f=__frame(d,'+js(target)+');';
    if(paragraph) body += 'var ps=d.paragraphStyles.itemByName('+js(paragraph)+');if(!ps.isValid)throw new Error("Paragraph style not found");f.parentStory.paragraphs.everyItem().appliedParagraphStyle=ps;';
    if(character) body += 'var cs=d.characterStyles.itemByName('+js(character)+');if(!cs.isValid)throw new Error("Character style not found");f.parentStory.characters.everyItem().appliedCharacterStyle=cs;';
    body += 'return JSON.stringify({success:true,operation:"applyStyle",target:f.name||f.id});';
  } else if (operation === "export") {
    const path=requireString(params,"path");
    const format=String(params.format??"pdf").toLowerCase();
    body += 'var d=__doc();var f=new File('+js(path)+');__ensureParent(f);';
    if(format==="pdf"){
      const preset=optionalString(params,"preset");
      if(preset) body += 'var preset=app.pdfExportPresets.itemByName('+js(preset)+');if(!preset||!preset.isValid)throw new Error("PDF export preset not found");d.exportFile(ExportFormat.PDF_TYPE,f,false,preset);';
      else body += 'd.exportFile(ExportFormat.PDF_TYPE,f,false);';
    } else if(format==="idml") {
      body += 'd.exportFile(ExportFormat.INDESIGN_MARKUP,f,false);';
    } else if(format==="html") {
      body += 'd.exportFile(ExportFormat.HTML,f,false);';
    } else if(format==="epub") {
      body += 'd.exportFile(ExportFormat.EPUB,f,false);';
    } else throw new Error("InDesign export format must be pdf, idml, html or epub");
    body += 'return JSON.stringify({success:true,operation:"export",format:'+js(format)+',path:f.fsName});';
  } else {
    throw new Error("Unsupported indesign.document.layout operation");
  }
  return {...params,script:wrapScript(body),compiledBy:"adobe-mcp"};
}

export function compileInDesign(capability:string,params:Record<string,unknown>):Record<string,unknown>{
  if(typeof params.script==="string"&&params.script)return params;
  if(capability==="indesign.document.layout")return layout(params);
  return params;
}

import type { AdobeApp, Capability, CapabilityTarget } from "./types.js";

const C = (
  app: AdobeApp,
  id: string,
  title: string,
  description: string,
  tags: string[],
  risk: Capability["risk"] = "write"
): Capability => ({ app, id: `${app}.${id}`, title, description, tags, risk });

const R = (
  id: string,
  title: string,
  description: string,
  tags: string[],
  risk: Capability["risk"] = "write"
): Capability => ({ app: "runtime", id, title, description, tags, risk });

export const CAPABILITIES: Capability[] = [
  R("creative.assets.index", "Index creative assets", "Scan local source/reference assets and return compact media metadata; ffprobe enriches video/audio when installed.", ["creative","assets","media","reference","index"], "read"),
  R("creative.reference.analyze", "Analyze a reference video", "Extract scene-cut timing, shot pacing, silence, loudness, sampled frames and compact review artifacts from a local reference video.", ["creative","reference","video","pacing","style","analysis"], "write"),
  R("creative.preview.generate", "Generate review artifacts", "Create a low-resolution video proxy, sampled contact sheet and optional waveform using local ffmpeg so the agent can inspect its own output.", ["creative","review","preview","contact-sheet","waveform"], "write"),
  R("creative.output.validate", "Validate rendered media", "Machine-check an output file with ffprobe against dimensions, FPS, duration, codec, audio and minimum-size expectations.", ["creative","qa","validate","render","output"], "read"),
  R("creative.editspec.validate", "Validate an EditSpec", "Validate the structured creative brief, deliverables, acceptance criteria and semantic operation plan before editing.", ["creative","editspec","plan","validate"], "read"),
  R("creative.job.create", "Create a creative job", "Persist a validated EditSpec and return a compact job ID for the whole edit/review/repair lifecycle.", ["creative","job","plan"]),
  R("creative.job.get", "Read a creative job", "Return compact status or the full persisted EditSpec/job state.", ["creative","job","status"], "read"),
  R("creative.job.artifact", "Register a job artifact", "Hash and persist a working, preview, review, deliverable or reference file in the job artifact manifest.", ["creative","job","artifact","manifest"]),
  R("creative.job.checkpoint", "Checkpoint working files", "Snapshot project/working files into the durable job checkpoint store before risky edits.", ["creative","job","checkpoint","undo"]),
  R("creative.job.restore", "Restore a checkpoint", "Restore one or all files from a checkpoint after creating a pre-restore backup. Requires confirm=true.", ["creative","job","checkpoint","restore","rollback"], "destructive"),
  R("creative.job.update", "Update a creative job", "Replace the EditSpec for a repair/replan pass or attach a compact note.", ["creative","job","repair","replan"]),
  R("creative.job.run", "Run a creative job", "Execute the EditSpec semantic operations in order across connected Adobe host adapters.", ["creative","job","execute","master-edit"]),
  R("creative.job.review", "Record a review pass", "Persist the agent's rendered-output review and criterion verdicts. Passing requires all required criteria and review artifacts.", ["creative","job","review","qa"]),

  C("premiere", "context.inspect", "Inspect active Premiere context", "Project, active sequence, selection, playhead, tracks and media summary.", ["inspect","project","sequence"], "read"),
  C("premiere", "project.manage", "Manage Premiere project", "Create/open/save projects, bins, imports, relinks, proxies and metadata.", ["project","media","bin","proxy"]),
  C("premiere", "timeline.edit", "Edit timeline", "Insert, overwrite, move, ripple, roll, slip, slide, razor, lift, extract, trim and reorder clips.", ["timeline","edit","trim"]),
  C("premiere", "timeline.assemble", "Assemble an edit", "Build a rough cut or polished sequence from media, selects, transcript, beats or edit instructions.", ["timeline","assembly","rough-cut"]),
  C("premiere", "timeline.qa", "Inspect timeline quality", "Detect timeline gaps, overlaps, suspiciously short clips and return compact track/clip structure for review.", ["timeline","qa","review","gaps"], "read"),
  C("premiere", "effects.apply", "Apply and tune effects", "Apply native/installed effects, transitions and keyframed effect parameters.", ["effects","transitions","keyframes"]),
  C("premiere", "motion.animate", "Animate clip motion", "Animate position, scale, rotation, opacity, crop, masks and time remapping.", ["motion","animation","keyframes"]),
  C("premiere", "color.grade", "Color grade", "Apply Lumetri-style primary/secondary corrections, LUT workflows and shot matching where exposed.", ["color","grade","lumetri"]),
  C("premiere", "audio.mix", "Edit and mix audio", "Gain, fades, pan, effects, ducking, track mixing, sync and loudness-oriented operations.", ["audio","mix"]),
  C("premiere", "captions.manage", "Manage captions", "Create/import/edit/style captions and subtitle tracks.", ["captions","subtitles"]),
  C("premiere", "graphics.manage", "Manage graphics", "Create titles, essential graphics, MOGRT instances and graphic parameters where exposed.", ["graphics","titles","mogrt"]),
  C("premiere", "export.render", "Render or export", "Queue renders/exports directly or through Adobe Media Encoder using available presets.", ["export","render"]),

  C("after-effects", "context.inspect", "Inspect active After Effects context", "Project, active comp, selected layers, properties, time and render queue summary.", ["inspect","composition"], "read"),
  C("after-effects", "composition.manage", "Manage compositions", "Create, duplicate, resize, nest and configure compositions.", ["composition","precomp"]),
  C("after-effects", "layers.manage", "Manage layers", "Create/import/reorder/parent/duplicate/precompose and configure AV, text, shape, camera, light and null layers.", ["layers","precomp"]),
  C("after-effects", "properties.animate", "Animate properties", "Set keyframes, interpolation, easing, roving keys, temporal/spatial tangents and expressions.", ["animation","keyframes","easing","expressions"]),
  C("after-effects", "shapes.draw", "Create shape graphics", "Build and animate vector paths, fills, strokes, repeaters, trim paths and shape modifiers.", ["shape","vector","motion-graphics"]),
  C("after-effects", "text.animate", "Create and animate text", "Create text layers, styles, selectors, text animators and per-character motion.", ["text","kinetic-type"]),
  C("after-effects", "masks.mattes", "Create masks and mattes", "Create/edit/animate masks, feathering, track mattes and blend modes.", ["mask","matte"]),
  C("after-effects", "effects.apply", "Apply and tune effects", "Apply installed effects and animate exposed parameters.", ["effects","vfx"]),
  C("after-effects", "three-d.scene", "Build 3D scenes", "3D layers, cameras, lights, depth, parenting and camera animation.", ["3d","camera","light"]),
  C("after-effects", "tracking.apply", "Apply tracking data", "Use available point/camera/stabilization tracking commands and apply resulting data where exposed.", ["tracking","stabilize","camera"]),
  C("after-effects", "render.queue", "Render compositions", "Configure render queue items, output modules and launch renders.", ["render","export"]),

  C("photoshop", "context.inspect", "Inspect active Photoshop context", "Document, canvas, selected layers, masks, channels and selection summary.", ["inspect","document"], "read"),
  C("photoshop", "document.manage", "Manage documents", "Create/open/save/resize/crop/rotate documents, canvas and color modes.", ["document","canvas"]),
  C("photoshop", "layers.manage", "Manage layers", "Create, group, reorder, duplicate, rename, transform and configure layer properties.", ["layers","groups"]),
  C("photoshop", "selection.mask", "Create selections and masks", "Select by geometry/color/content, refine selections and create/edit layer masks.", ["selection","mask"]),
  C("photoshop", "paint.retouched", "Paint and retouch", "Run brush/heal/clone/content-aware style operations when exposed by the host API or recorded actions.", ["paint","retouch"]),
  C("photoshop", "adjustments.apply", "Apply adjustments", "Curves, levels, hue/saturation, exposure, color balance and adjustment layers.", ["adjustment","color"]),
  C("photoshop", "filters.apply", "Apply filters", "Apply native/installed filters, smart filters and batchPlay-described operations.", ["filters","effects"]),
  C("photoshop", "smart-objects.manage", "Manage smart objects", "Create, replace, relink, transform and edit smart objects.", ["smart-object"]),
  C("photoshop", "text.manage", "Create and style text", "Create/edit text layers, typography, warps and paragraph settings where exposed.", ["text","typography"]),
  C("photoshop", "paths.vector", "Create paths and vector shapes", "Create/edit paths, vector masks and shape layers.", ["paths","vector"]),
  C("photoshop", "export.assets", "Export assets", "Export documents/layers/artboards to common raster formats with compact presets.", ["export","assets"]),

  C("illustrator", "context.inspect", "Inspect active Illustrator context", "Document, artboards, selection, layers, swatches, symbols and placed assets.", ["inspect","document"], "read"),
  C("illustrator", "document.manage", "Manage Illustrator documents", "Create/open/save documents, artboards, layers and document settings.", ["document","artboard"]),
  C("illustrator", "vector.create", "Create vector artwork", "Create paths, shapes, compound paths, clipping masks and boolean/pathfinder-style operations.", ["vector","path","shape"]),
  C("illustrator", "vector.transform", "Transform artwork", "Move, scale, rotate, reflect, shear, align, distribute and repeat artwork.", ["transform","align"]),
  C("illustrator", "appearance.style", "Style artwork", "Fills, strokes, gradients, opacity, blend modes, appearances and graphic styles.", ["appearance","gradient","style"]),
  C("illustrator", "text.manage", "Create and style type", "Point/area/path text, typography, paragraph styles and outlined type workflows.", ["text","typography"]),
  C("illustrator", "symbols.patterns", "Manage symbols and patterns", "Create/use symbols, patterns, brushes and reusable assets where exposed.", ["symbol","pattern","brush"]),
  C("illustrator", "image.trace", "Trace raster artwork", "Run and configure image-trace workflows where available.", ["trace","vectorize"]),
  C("illustrator", "export.assets", "Export artwork", "Export artboards/assets to SVG, PDF and raster formats.", ["export","svg","pdf"]),

  C("audition", "context.inspect", "Inspect Audition context", "Inspect active file/session and selection when an adapter can expose it.", ["inspect","audio"], "read"),
  C("audition", "audio.process", "Process audio", "Apply supported destructive/non-destructive audio processing, cleanup and loudness operations.", ["audio","cleanup"]),
  C("media-encoder", "queue.manage", "Manage Media Encoder queue", "Add sources/sequences/comps, select presets, outputs and start/stop queue.", ["queue","encode"]),
  C("media-encoder", "presets.manage", "Manage encoding presets", "Discover and apply available encode presets.", ["preset","encode"], "read"),
  C("indesign", "document.layout", "Automate InDesign layouts", "Documents, pages, frames, text, styles, links, tables and export.", ["layout","publishing"]),
  C("animate", "timeline.author", "Automate Animate timelines", "Documents, symbols, layers, frames, tweens and JSFL-driven authoring.", ["animation","jsfl"]),
  C("lightroom-classic", "catalog.manage", "Automate Lightroom Classic catalog workflows", "Catalog queries, metadata, develop/export workflows through a local plugin adapter.", ["photo","catalog"]),
  C("acrobat", "pdf.automate", "Automate Acrobat documents", "Page, form, annotation, JavaScript actions and document workflows available to Acrobat automation.", ["pdf","acrobat"]),
  C("bridge", "assets.manage", "Automate Adobe Bridge assets", "Browse, metadata, rename, collections and batch asset operations.", ["assets","metadata"]),
  C("substance-3d", "project.automate", "Automate Substance 3D workflows", "Project/material/export operations exposed by installed Substance host APIs.", ["3d","material"])
];

export function searchCapabilities(query = "", app?: CapabilityTarget, limit = 30): Capability[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return CAPABILITIES
    .filter((c) => !app || c.app === app)
    .map((c) => {
      const haystack = [c.id, c.title, c.description, ...c.tags].join(" ").toLowerCase();
      const score = tokens.reduce((n, t) => n + (haystack.includes(t) ? 1 : 0), 0);
      return { c, score };
    })
    .filter(({ score }) => tokens.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id))
    .slice(0, Math.max(1, Math.min(limit, 100)))
    .map(({ c }) => c);
}

export function getCapability(id: string): Capability | undefined {
  return CAPABILITIES.find((c) => c.id === id);
}

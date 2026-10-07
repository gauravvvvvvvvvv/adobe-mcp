# Capability map

This document summarizes the **implemented v0.1 semantic surface**. `search_capabilities` stays intentionally compact; call `get_capability` for an on-demand parameter/operation/example guide, and `creative.runtime.limits` for known host/API ceilings. The live completion state is in `docs/TASKS.md`.

## Creative runtime

Persistent EditSpec jobs, asset indexing/fingerprinting, reference-video analysis, reusable recipes, checkpoints/restores, artifact manifests, rendered-output validation, proxy/contact-sheet/waveform generation, explicit review verdicts and repair planning.

## Premiere Pro

- project open/new/close/save/save-as, bin creation, media import, sequence create/activate
- explicit insert/overwrite assembly from source ranges
- move/delete/ripple-delete/trim/razor/lift/extract/speed/reverse/enable-disable edits
- structural timeline QA
- generic component-property animation, Crop and Time Remapping Speed
- installed video/audio effects and transitions through Premiere/QE, with exposed named parameter writes
- Lumetri parameter/LUT apply plus compact property inspection
- clip volume/pan, volume keyframes, ducking curves and whole-track mute
- SRT/caption item import into caption tracks
- MOGRT import/inspect, named parameter writes and best-effort editable Source Text
- AME handoff with explicit preset/output path

Full Audio Track Mixer automation and stable cross-version caption styling/readback are explicit host limits.

## After Effects

- composition create/configure/duplicate/precompose
- text/solid/null/shape/camera/light/footage layers plus duplicate/remove/parent/reorder
- generic property-path keyframes, interpolation/easing/roving/Bezier controls and expressions
- native text animators and range-selector keyframes
- rectangle/ellipse/arbitrary Bezier shape layers, fill/stroke, trim paths and repeaters
- masks, track mattes and blend modes
- installed effects, parameters and `.ffx` presets
- 3D layers, cameras, lights and parenting
- apply precomputed tracking data to Position, stabilization or Corner Pin
- render queue inspect/add/set/remove/render/pause/stop

The runtime does not claim to expose every interactive tracker/roto workflow.

## Photoshop

- document create/open/save/duplicate/resize/crop
- layer create/group/order/duplicate/delete/transform/blend/clipping-mask operations
- layer-wide and mixed-range typography
- selection geometry/subject/refinement/boundary transforms/work-path/mask creation
- Content-Aware Fill plus path-driven Clone Stamp / Healing Brush retouching
- non-destructive adjustment-layer creation and typed common adjustment parameters
- common filters/smart filters plus explicit `batchPlay` fallback
- Smart Object convert/replace/relink/edit/update
- vector path list/create/select/duplicate/remove/selection/stroke/fill/clipping-path operations
- PNG/JPEG/PSD/PSB save-as

Less-common Action Manager operations remain available through the explicit descriptor escape hatch.

## Illustrator

- document lifecycle and artboard lifecycle
- primitive/Bezier vector paths, compound paths and clipping groups
- move/rotate/scale/z-order plus align/distribute
- fill/stroke/opacity/blend modes, gradients, existing patterns, graphic styles and live-effect XML
- point/area/path text with paragraph and per-character styling
- symbols plus application of existing patterns/brushes
- image trace and expansion
- SVG/PNG/JPEG/PDF export

Brush-definition authoring and arbitrary pattern-tile population are explicit scripting-model limits.

## Media Encoder

Native UXP queue status/control, enqueue/render/stitch/image-sequence, job/log/missing-asset inspection, project GUID lookup and add-output. Preset support validates/inspects local `.epr` files and lists `.epr` files in known folders; queue operations consume the selected preset path.

## Audition

Stable CEP surface for open/save/close, Favorites, arbitrary enabled commands, transport/loop control, multitrack track state and markers. Deep interactive effect-rack graph editing is not claimed.

## InDesign

Typed document/page/text/image/style/link/export layout operations through the CEP compiler.

## Animate

Document create/open/save/publish/export plus layer/frame/keyframe/motion-tween/text/alignment operations through JSFL.

## Lightroom Classic

Lua startup-plugin catalog/selection inspection, metadata read/write, develop preset application, rotation, imports, virtual copies, collections and programmatic export.

## Acrobat Pro

Trusted folder-level JavaScript for inspect/open/save/close, page insert/delete/replace/extract/rotate, watermarks, annotations, forms, flattening and page labels.

## Bridge

Selection/inspect, ratings, labels, metadata serialization, copy/move/open and folder browsing.

## Substance 3D Painter

Python startup adapter for project lifecycle, texture-set/stack inspection, fill/paint/group layers, material/resource operations, blending/opacity and texture export/preview.

## Required behavior for every adapter

- reconnect to the local broker without requiring an MCP restart
- announce real capabilities at runtime
- return compact context/state
- fail explicitly instead of silently faking unsupported behavior
- prefer native/official APIs, then host scripting/command IDs, then documented fallbacks
- keep model-facing operations semantic rather than exposing hundreds of primitive tools

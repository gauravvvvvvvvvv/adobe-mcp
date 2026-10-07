# Capability map

This is the target surface. Individual host adapters will progressively mark each item as native, partial, fallback, or unavailable for the installed app/version.

## Premiere Pro

Project/media ingest, bins, metadata, relink, replace footage, proxies, sequences, tracks, markers, multicam, transcript/captions, clip insert/overwrite, ripple/roll/slip/slide/razor/lift/extract, speed/duration, time remapping, transforms, opacity, crop, masks, keyframes/easing, transitions, native/installed effects, color/LUT workflows, audio gain/mix/fades/effects/ducking, titles/graphics/MOGRT parameters, nesting, sync, render previews, export and Media Encoder queueing.

Higher-level editor operations should include: assemble from selects, cut to music/beats, remove pauses, build social cutdowns, J/L cuts, B-roll insertion, continuity cleanup, multicam switching, dialogue cleanup, caption styling, shot normalization and export variants.

## After Effects

Projects, footage, comps, precomps, layer creation/import/ordering/parenting, transforms, 2D/3D layers, cameras, lights, text, text animators, shape layers, vector paths, fills/strokes, trim paths/repeaters/modifiers, masks, feathering, mattes, blend modes, keyframes, graph/easing/tangents, expressions, markers, time remap, effects/plugins, effect parameters, adjustment layers, nulls, motion blur, cameras, basic tracking/stabilization commands where exposed, render queue and output modules.

The semantic layer should be able to describe motion-design intent such as logo reveals, kinetic typography, parallax, lower thirds, HUDs, particles/plugin setups, transitions, camera moves, title sequences and compositing recipes, then compile those into native layer/property operations.

Not every interactive AE feature is scriptable. Roto Brush painting and some third-party panels are examples where an optional UI/operator fallback may be required.

## Photoshop

Documents/canvas, layers/groups, selections, masks, channels, transforms, smart objects, adjustment layers, blend modes, layer styles, filters/smart filters, batchPlay operations, text/typography, paths/vector shapes, crop/resize, content-aware/retouch commands where exposed, brushes/actions, guides, artboards, color profiles, exports and asset variants.

## Illustrator

Documents/artboards, layers, paths, anchors/handles, primitive shapes, compound paths, clipping masks, pathfinder/boolean operations, transforms, align/distribute, fills/strokes, gradients, appearance, opacity/blending, typography, type-on-path, symbols, patterns, brushes, swatches, placed/embedded images, image trace, effects where scriptable and SVG/PDF/raster export.

## Media Encoder

Queue items, source discovery, sequence/comp handoff, preset discovery/application, output paths, queue start/stop, status and batch variants.

## Audition

Session/file context, clip placement, gain/fades, effects and cleanup/loudness workflows only to the degree exposed by an installed automation surface. Audition has a narrower official scripting story than Photoshop/Illustrator/InDesign, so the adapter must report real capabilities instead of pretending full parity.

## InDesign

Documents, pages/spreads, frames, text, styles, tables, links/assets, master/parent pages, layout geometry, preflight and PDF/export workflows.

## Animate

JSFL-driven documents, library assets, symbols, layers, frames, keyframes, classic/motion tweens, transforms and publishing.

## Lightroom Classic

Lua-plugin catalog queries, metadata, collections, ratings/flags, develop/export workflows available to the plugin SDK.

## Acrobat

Document/page operations, forms, annotations, JavaScript actions, metadata and export/processing available to Acrobat automation.

## Bridge

Asset browsing, metadata, labels/ratings, rename/move/copy, collections and batch asset workflows.

## Substance 3D family

Per-product adapters using available Python/plugin APIs for project, material, texture, render and export workflows. Exact coverage is product/version specific.

## Required behavior for every adapter

- Auto-reconnect to the local broker.
- Announce exact capabilities at runtime.
- Stable IDs for documents, comps, layers, clips and other addressable objects.
- Compact context snapshots.
- Group edits into one undo group/transaction when the host supports it.
- Return changed-object IDs and warnings instead of huge payloads.
- Never silently fake unsupported functionality.
- Prefer native APIs, then host scripting/command IDs, then explicitly opt-in UI fallback.

# Adobe MCP v1 Task Checklist

This file is the live implementation checklist. **Every implementation commit must update this file.**

Last updated commit target: documentation/bootstrap after `812c567c`.

Legend: [x] done, [~] usable but incomplete, [ ] not done.

## Product contract

- [x] One MCP registration for Codex / Claude Code.
- [x] Persistent local broker; Adobe hosts reconnect without MCP restart.
- [x] Compact capability discovery instead of advertising hundreds of schemas.
- [x] Persistent hashed app-context cache to reduce repeated tokens.
- [x] Persistent EditSpec / creative-job lifecycle.
- [x] Local source/reference asset indexing.
- [x] Local review proxy/contact-sheet/waveform generation.
- [x] Deterministic media-output validation.
- [x] Review cannot pass without required acceptance criteria.
- [ ] One-prompt end-to-end master-edit recipe tested against a real Premiere project.
- [ ] Automatic repair loop exercised against a deliberately broken render.
- [ ] Stable packaged manual installer for all supported host adapters.

## Runtime / agent workflow

- [x] `creative.assets.index`
- [x] `creative.editspec.validate`
- [x] `creative.job.create/get/update/run/review`
- [x] `creative.preview.generate`
- [x] `creative.output.validate`
- [ ] Asset-analysis packs: scene cuts, dense keyframes, silence map, audio loudness and clip fingerprints.
- [ ] Reference-video analysis manifest suitable for model inspection.
- [ ] Recipe library for common professional edit/motion/graphics workflows.
- [ ] Checkpoint/rollback metadata for destructive multi-step edits.
- [ ] Job artifact manifest with project, preview, final and review revisions.
- [ ] Resume/recovery after host crash during a job.

## Premiere Pro

- [x] CEP host connection and compact context inspection.
- [ ] Typed project operations: save, import media, bins, sequence selection/creation.
- [ ] Typed timeline assembly from explicit source ranges.
- [ ] Typed insert/overwrite/move/trim/ripple/razor/lift/extract operations.
- [ ] Clip speed/duration and time-remap primitives.
- [ ] Motion/opacity/crop keyframes.
- [ ] Effects and transition application.
- [ ] Color/LUT controls.
- [ ] Audio gain/fades/mixing primitives.
- [ ] Caption/subtitle operations.
- [ ] Graphics/MOGRT operations.
- [ ] Export / Media Encoder handoff.
- [ ] High-level rough-cut recipe.
- [ ] J/L-cut recipe.
- [ ] Beat-cut / music-sync recipe.
- [ ] Social cutdown / aspect-ratio adaptation recipe.
- [ ] Timeline structural QA.

## After Effects

- [x] CEP host connection and compact context inspection.
- [ ] Typed composition creation/duplication/precomp.
- [ ] Typed layer creation/import/parent/reorder.
- [ ] Typed transform/property keyframes and easing.
- [ ] Text layers and text animators.
- [ ] Shape layers, paths, fills, strokes, trim paths/repeaters.
- [ ] Masks/mattes/blend modes.
- [ ] Effects/plugin parameters.
- [ ] Cameras/lights/3D layers.
- [ ] Render queue/output module controls.
- [ ] Kinetic typography recipe.
- [ ] Logo reveal recipe.
- [ ] Parallax/camera-push recipe.
- [ ] Lower-third / HUD recipe.
- [ ] Compositing/VFX recipe primitives.

## Photoshop

- [x] UXP auto-reconnect bridge.
- [x] Compact context inspection.
- [x] Typed active-layer rename/opacity/visibility.
- [~] Broad `batchPlay` escape hatch.
- [ ] Typed document create/open/save/crop/resize.
- [ ] Typed layer create/group/reorder/duplicate/transform.
- [ ] Text creation/style.
- [ ] Selection/mask primitives.
- [ ] Adjustment layers and common filters.
- [ ] Smart-object replace/relink.
- [ ] Export assets.
- [ ] Compositing/retouch recipe primitives.

## Illustrator

- [x] CEP connection and compact context inspection.
- [ ] Typed document/artboard operations.
- [ ] Path/shape creation.
- [ ] Transforms/alignment/distribution.
- [ ] Fill/stroke/gradient/appearance.
- [ ] Typography.
- [ ] Symbols/patterns/brushes.
- [ ] Image trace.
- [ ] SVG/PDF/raster export.
- [ ] Logo/vector-asset recipe primitives.

## Other Adobe hosts

- [x] InDesign CEP registration and context path.
- [ ] Media Encoder adapter.
- [ ] Audition adapter or honest capability detector/fallback.
- [ ] Animate JSFL adapter.
- [ ] Lightroom Classic Lua adapter.
- [ ] Acrobat adapter.
- [ ] Bridge adapter.
- [ ] Substance 3D adapters.

## Installation / operations

- [x] Windows CEP manual install/uninstall.
- [x] No GitHub Actions / CI.
- [ ] Photoshop UXP packaged/manual installer.
- [ ] macOS CEP install/uninstall.
- [ ] `doctor` verifies ffmpeg/ffprobe, bridge port, adapters and install locations.
- [ ] One command local setup for Codex/Claude configs where safely detectable.
- [ ] Package manifest includes every adapter/install script needed by npm package.

## Tests and quality

- [ ] Unit tests for EditSpec validation.
- [ ] Unit tests for capability routing and runtime jobs.
- [ ] Unit tests for script escaping/injection safety.
- [ ] Static syntax tests for generated ExtendScript.
- [ ] Broker reconnect test with mock WebSocket adapter.
- [ ] Media review/validation tests using generated fixture media.
- [ ] Manual Premiere smoke-test script/checklist.
- [ ] Manual AE smoke-test script/checklist.
- [ ] Manual Photoshop smoke-test script/checklist.
- [ ] Manual Illustrator smoke-test script/checklist.
- [ ] Full manual end-to-end acceptance checklist.

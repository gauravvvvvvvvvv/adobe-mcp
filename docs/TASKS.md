# Adobe MCP v1 Task Checklist

This file is the live implementation checklist. **Every implementation commit must update this file.**

Last updated commit target: semantic compiler implementation after `0b487bfc`.

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
- [~] Typed project operations: save/saveAs, import media, bins, sequence activation/creation.
- [~] Typed timeline assembly from explicit source ranges, tracks and placement times.
- [~] Typed insert/overwrite assembly plus move/trim/delete/ripple-delete/set-enabled primitives; razor/lift/extract still pending.
- [ ] Clip speed/duration and time-remap primitives.
- [~] Generic component/property keyframes support Motion/Opacity and other exposed properties; crop-specific helper pending.
- [ ] Effects and transition application.
- [ ] Color/LUT controls.
- [~] Clip volume level + volume-keyframe primitives; pan/track mix/ducking helpers pending.
- [ ] Caption/subtitle operations.
- [ ] Graphics/MOGRT operations.
- [~] Adobe Media Encoder handoff with explicit .epr preset and output path.
- [ ] High-level rough-cut recipe.
- [ ] J/L-cut recipe.
- [ ] Beat-cut / music-sync recipe.
- [ ] Social cutdown / aspect-ratio adaptation recipe.
- [ ] Timeline structural QA.

## After Effects

- [x] CEP host connection and compact context inspection.
- [~] Typed composition create/duplicate/precompose.
- [~] Typed text/solid/null/shape/camera/light create plus duplicate/remove; footage import/parent/reorder pending.
- [~] Generic property-path keyframes and temporal easing.
- [~] Text-layer creation with transform intro animation; native text animator selectors pending.
- [~] Rectangle/ellipse shape layers with fills; arbitrary paths/strokes/trim/repeaters pending.
- [ ] Masks/mattes/blend modes.
- [ ] Effects/plugin parameters.
- [ ] Cameras/lights/3D layers.
- [~] Render queue item/output path/templates/start controls.
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
- [~] Document create/saveAs and artboard creation.
- [~] Rectangle/ellipse/polygon/arbitrary-path creation.
- [~] Move/rotate/scale; alignment/distribution pending.
- [~] Fill/stroke/opacity; gradient/advanced appearance pending.
- [~] Point-text creation/style basics.
- [ ] Symbols/patterns/brushes.
- [ ] Image trace.
- [~] SVG/PNG/JPEG export; PDF-specific save/export pending.
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

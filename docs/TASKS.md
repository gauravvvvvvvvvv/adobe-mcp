# Adobe MCP v1 Task Checklist

This file is the live implementation checklist. **Every implementation commit must update this file.**

Last updated commit target: Premiere razor/pan/ducking/track-mute compiler block after `dc16e23e`.

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
- [~] CEP installers are scripted on Windows/macOS; Photoshop local-dev setup is scripted, while Adobe-supported distributable `.ccx` packaging must be produced with UXP Developer Tool on a machine that has it.

## Runtime / agent workflow

- [x] `creative.assets.index`
- [x] `creative.editspec.validate`
- [x] `creative.job.create/get/update/run/review`
- [x] `creative.preview.generate`
- [x] `creative.output.validate`
- [~] Asset/reference analysis now includes scene cuts, sampled frames, silence map and loudness; perceptual fingerprints and per-source bulk analysis remain pending.
- [x] Reference-video analysis manifest with shot pacing statistics, proxy/contact sheet/waveform and sampled-frame paths.
- [x] Code-backed recipe library with list/expand for Premiere rough cut, J/L-cut, beat-cut, social cutdown, AE kinetic typography/logo reveal/parallax, Photoshop compositing and Illustrator logo systems.
- [x] Working-file checkpoints with SHA-256 snapshots and confirm-gated restore with pre-restore backup.
- [x] Persistent per-job artifact manifest with kind/role/revision/size/hash/metadata; preview and validated deliverables can auto-register.
- [x] Persistent running/succeeded/failed operation states; interrupted operations become unknown-outcome and are never replayed unless resumeUnknown=true.

## Premiere Pro

- [x] CEP host connection and compact context inspection.
- [~] Typed project operations: save/saveAs, import media, bins, sequence activation/creation.
- [~] Typed timeline assembly from explicit source ranges, tracks and placement times.
- [~] Typed insert/overwrite assembly plus move/trim/delete/ripple-delete/set-enabled and QE razor (single/all tracks); lift/extract remain pending because Premiere exposes no stable documented direct API.
- [~] QE speed/reverse/maintain-pitch/ripple primitive added; animated time-remapping remains pending.
- [~] Generic component/property keyframes support Motion/Opacity and other exposed properties; crop-specific helper pending.
- [~] Typed QE effect and transition application with named parameter writes.
- [~] Lumetri Color parameter writes and Input LUT path support.
- [~] Clip volume, pan, volume keyframes, computed ducking curves and whole-track mute are typed; track mixer automation/effect-send helpers remain pending.
- [~] SRT/project-item import into caption track with caption-format mapping; styling/readback remains limited by Premiere scripting API.
- [~] MOGRT import, named properties and best-effort Source Text payload mutation.
- [~] Adobe Media Encoder handoff with explicit .epr preset and output path.
- [x] High-level rough-cut recipe.
- [x] J/L-cut recipe blueprint with independently addressable audio/video trim operations.
- [x] Beat-cut / music-sync recipe using explicit beat timestamps.
- [~] Social cutdown recipe covers reframing/captions/QA; target sequence preset/aspect-ratio creation remains host/preset dependent.
- [x] Timeline structural QA for gaps, overlaps and suspiciously short video clips plus compact track structure.

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
- [x] Kinetic typography recipe.
- [x] Logo reveal recipe.
- [~] Parallax recipe prepares camera/depth layers; explicit camera animation is appended by the agent.
- [ ] Lower-third / HUD recipe.
- [ ] Compositing/VFX recipe primitives.

## Photoshop

- [x] UXP auto-reconnect bridge.
- [x] Compact context inspection.
- [x] Typed active-layer rename/opacity/visibility plus duplicate/delete/rotate/scale/grouping and layer creation.
- [~] Broad `batchPlay` escape hatch.
- [x] Typed document create/open/save/crop/resize/duplicate.
- [~] Typed pixel/text/group create, selected grouping, duplicate/delete/rotate/scale; explicit reordering/translation helpers pending.
- [~] Typed text create/content/font-size basics; advanced paragraph/character styling pending.
- [~] Select all/deselect/invert/rectangle/ellipse/subject and mask-from-selection; Photoshop 25+ DOM improves selection operations.
- [~] Typed destructive brightness/contrast, levels, Gaussian blur and sharpen; adjustment-layer recipes/more filters pending.
- [~] Smart-object replace-contents via UXP session token; relink/edit-content pending.
- [~] PNG/JPEG/PSD/PSB save-as to arbitrary local paths.
- [~] Compositing recipe covers subject selection/mask/export; advanced retouch recipes remain pending.

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
- [x] Logo/vector recipe builds deterministic primitives plus optional wordmark.

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
- [~] UXP adapter now supports arbitrary fixed local paths via fullAccess; packaged/manual CCX installer still pending.
- [ ] macOS CEP install/uninstall.
- [ ] `doctor` verifies ffmpeg/ffprobe, bridge port, adapters and install locations.
- [ ] One command local setup for Codex/Claude configs where safely detectable.
- [ ] Package manifest includes every adapter/install script needed by npm package.

## Tests and quality

- [x] Unit tests for EditSpec validation/defaults/rejections.
- [~] Unit tests cover compiler capability routing; persistent runtime-job tests still pending.
- [x] Unit tests for script escaping/injection safety.
- [x] Static syntax tests for generated Premiere/AE/Illustrator ExtendScript output.
- [x] Broker reconnect regression test with mock WebSocket host.
- [x] Media review/validation regression test using generated ffmpeg fixture media.
- [x] Manual Premiere smoke-test checklist in `docs/ACCEPTANCE.md`.
- [x] Manual AE smoke-test checklist in `docs/ACCEPTANCE.md`.
- [x] Static Photoshop adapter regression plus real-host smoke checklist in `docs/ACCEPTANCE.md`.
- [x] Manual Illustrator smoke-test checklist in `docs/ACCEPTANCE.md`.
- [x] Full one-prompt review/repair/checkpoint acceptance checklist in `docs/ACCEPTANCE.md`.

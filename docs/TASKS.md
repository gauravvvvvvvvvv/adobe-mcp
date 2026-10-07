# Adobe MCP v1 Task Checklist

This file is the live implementation checklist. **Every implementation commit must update this file.**

Last updated commit target: cached bulk asset fingerprint analysis after `353c4848`.

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
- [~] Code-backed `premiere.master-edit` plus `adobe-mcp-accept` now automate guarded real-host open/checkpoint/edit/export/validation/review handoff; an actual workstation run is still required to mark host acceptance complete.
- [~] `creative.repair.plan` is exercised by the real-host harness using an intentionally incorrect delivery expectation; actual vision-guided repair acceptance still requires a workstation run.
- [~] CEP installers are scripted on Windows/macOS; Photoshop local-dev setup is scripted, while Adobe-supported distributable `.ccx` packaging must be produced with UXP Developer Tool on a machine that has it.

## Runtime / agent workflow

- [x] `creative.assets.index`
- [x] `creative.assets.analyze` with persistent local fingerprint cache and duplicate detection.
- [x] `creative.editspec.validate`
- [x] `creative.job.create/get/update/run/review`
- [x] `creative.preview.generate`
- [x] `creative.output.validate`
- [x] Asset/reference analysis includes bulk cached asset manifests, optional exact SHA-256, visual dHash/audio fingerprints, duplicate/near-duplicate detection, plus reference scene cuts, sampled frames, silence map and loudness.
- [x] Reference-video analysis manifest with shot pacing statistics, proxy/contact sheet/waveform and sampled-frame paths.
- [x] Code-backed recipe library with list/expand for Premiere rough cut, J/L-cut, beat-cut, social cutdown, AE kinetic typography/logo reveal/parallax, Photoshop compositing and Illustrator logo systems.
- [x] Working-file checkpoints with SHA-256 snapshots and confirm-gated restore with pre-restore backup.
- [x] Persistent per-job artifact manifest with kind/role/revision/size/hash/metadata; preview and validated deliverables can auto-register.
- [x] Persistent running/succeeded/failed operation states; interrupted operations become unknown-outcome and are never replayed unless resumeUnknown=true.

## Premiere Pro

- [x] CEP host connection and compact context inspection.
- [x] Typed project lifecycle and organization: open/new/close/save/saveAs, import media, bins and sequence activation/creation.
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
- [x] Typed text/solid/null/shape/camera/light/footage import plus duplicate/remove, parent and move-before/move-after ordering.
- [~] Generic property-path keyframes and temporal easing.
- [~] Text-layer creation with transform intro animation; native text animator selectors pending.
- [~] Rectangle/ellipse shape layers now support fills, strokes, trim paths and repeaters; arbitrary Bezier path construction remains pending.
- [~] Typed masks with shape/feather/opacity/expansion plus set/remove track mattes; explicit layer blend-mode helper remains pending.
- [x] Typed effect add/remove, effect parameter writes and animation-preset (.ffx) application.
- [x] Typed 3D enable/position/orientation/rotation/parent/motion-blur plus camera/light creation and basic options.
- [~] Render queue item/output path/templates/start controls.
- [x] Kinetic typography recipe.
- [x] Logo reveal recipe.
- [~] Parallax recipe prepares camera/depth layers; explicit camera animation is appended by the agent.
- [x] Lower-third and procedural HUD recipes using typed shape/text primitives.
- [x] Composite/VFX recipe covering footage import, typed masks, effects and optional 3D placement.

## Photoshop

- [x] UXP auto-reconnect bridge.
- [x] Compact context inspection.
- [x] Typed active-layer rename/opacity/visibility, duplicate/delete, rotate/scale/translate/skew/flip, front/back ordering, blend mode, clipping mask, grouping and layer creation.
- [~] Broad `batchPlay` escape hatch.
- [x] Typed document create/open/save/crop/resize/duplicate.
- [x] Typed pixel/text/group create, selected grouping, duplicate/delete, transform, front/back ordering, blend mode and clipping-mask controls.
- [~] Text creation/edit now supports font PostScript name, size, RGB color, tracking, leading, baseline shift, horizontal/vertical scale, faux bold/italic, paragraph justification/hyphenation/indents/spacing and point/paragraph conversion; per-range mixed styling remains pending.
- [~] Select all/deselect/invert/rectangle/ellipse/subject and mask-from-selection; Photoshop 25+ DOM improves selection operations.
- [~] Typed non-destructive adjustment-layer creation across Photoshop LayerKind adjustments plus destructive brightness/contrast/levels/hue-saturation/invert and blur/sharpen/noise/despeckle; per-adjustment parameter editing remains partly descriptor-backed.
- [x] Smart-object convert, replace contents, relink, edit contents and update-modified operations via typed UXP/batchPlay commands.
- [~] PNG/JPEG/PSD/PSB save-as to arbitrary local paths.
- [~] Compositing recipe can now combine subject selection/mask, transforms, clipping/blend controls, smart objects, adjustment layers and smart filters; advanced brush/heal/clone retouch recipes remain pending.

## Illustrator

- [x] CEP connection and compact context inspection.
- [~] Document create/saveAs and artboard creation.
- [~] Rectangle/ellipse/polygon/arbitrary-path creation.
- [x] Move/rotate/scale/z-order plus mathematical alignment to artboard/selection and horizontal/vertical distribution.
- [~] Fill/stroke/opacity, linear/radial gradients and existing-pattern fills; advanced appearance stacks/live effects remain pending.
- [~] Point-text creation/style basics.
- [~] Create/place symbols and apply existing document patterns; programmatic pattern-tile authoring and brush creation remain pending.
- [x] Local placed-image trace with preset/options, redraw and optional expansion.
- [x] SVG/PNG/JPEG export plus PDF save with editability/preset controls.
- [x] Logo/vector recipe builds deterministic primitives plus optional wordmark.

## Other Adobe hosts

- [x] InDesign CEP registration/context plus typed document/page/text/image/style/link/export layout compiler.
- [x] Media Encoder 27+ native UXP adapter: enqueue/render/stitch/image sequence, queue control, job/log/missing-assets/project-GUID lookup and add-output.
- [~] Audition CEP adapter + typed open/favorite/save/close/transport/loop/multitrack state/marker/command operations; deeper effect-rack editing remains host-limited.
- [x] Animate CEP/JSFL adapter with document create/open/save/publish/export, layer/frame/keyframe/motion-tween/text/alignment operations.
- [x] Lightroom Classic Lua adapter with auto-start/reconnect, catalog/selection inspection, metadata read/write, develop-preset application, rotate/import/virtual-copy/collection and programmatic export operations.
- [x] Acrobat Pro folder-level trusted JavaScript adapter with reconnecting localhost HTTP transport; inspect/open/save/close, insert/delete/replace/extract/rotate pages, watermarks, annotations, forms, flattening and page labels.
- [x] Bridge CEP adapter with selection/inspect, ratings, labels, metadata serialization, copy/move/open and folder browsing.
- [x] Substance 3D Painter Python startup adapter with Qt5/Qt6 reconnect bridge; project open/create/save/copy/close, texture-set resolution/inspection, fill/paint/group layers, material/resource operations, blending/opacity and texture export/preview.

## Installation / operations

- [x] Windows CEP manual install/uninstall.
- [x] No GitHub Actions / CI.
- [~] UXP adapter now supports arbitrary fixed local paths via fullAccess; packaged/manual CCX installer still pending.
- [x] macOS CEP install/uninstall scripts.
- [x] `doctor` verifies Node, ffmpeg/ffprobe, bridge/connected apps, every shipped adapter source, CEP/Lightroom/Acrobat/Substance installs and shared UXP developer mode; UXP host loading itself remains intentionally verified inside Adobe UXP Developer Tool.
- [x] `adobe-mcp-setup --client codex|claude` plus npm convenience scripts use each client CLI and avoid silent overwrite without force.
- [x] npm package `files` includes `dist`, all adapters, docs and scripts; `prepack` runs the manual local check suite.

## Tests and quality

- [x] Unit tests for EditSpec validation/defaults/rejections.
- [x] Runtime tests cover checkpoints/restore/artifacts, crash unknown-outcome handling, review acceptance enforcement and repair planning.
- [x] Unit tests for script escaping/injection safety.
- [x] Static syntax tests for generated Premiere/AE/Illustrator ExtendScript output.
- [x] Broker reconnect regression test with mock WebSocket host.
- [x] Media review/validation regression test using generated ffmpeg fixture media.
- [x] Manual Premiere smoke-test checklist in `docs/ACCEPTANCE.md`.
- [x] Manual AE smoke-test checklist in `docs/ACCEPTANCE.md`.
- [x] Static Photoshop adapter regression plus real-host smoke checklist in `docs/ACCEPTANCE.md`.
- [x] Manual Illustrator smoke-test checklist in `docs/ACCEPTANCE.md`.
- [x] Full one-prompt review/repair/checkpoint acceptance checklist plus guarded `adobe-mcp-accept` real-host Premiere runner and scenario template.

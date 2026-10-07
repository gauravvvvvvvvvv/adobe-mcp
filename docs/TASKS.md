# Adobe MCP v1 Task Checklist

This file is the live implementation checklist. **Every implementation commit must update this file.**

Last updated commit target: token-bounded batch execution results after `260ced5e`.

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

- [x] `batch_execute` defaults to compact result mode with bounded strings/arrays/object depth; full or no-result modes remain explicit when needed.
- [x] 2026-07-28 MCP v2 `serveStdio` factory lifecycle with broker cleanup on stdio disconnect and explicit handle shutdown.
- [x] `creative.audio.analyze` locally extracts silence regions, energy onsets and tempo estimates with ffmpeg so beat-aware planning does not require model-side audio decoding.
- [x] Cache-aware `creative.assets.review` batches bounded source contact-sheet generation with optional proxies/waveforms and reuses fresh artifacts across planning/repair passes.
- [x] `inspect_context(fresh=true)` routes each host to its real inspect operation (standard context, Media Encoder queue status, Lightroom catalog inspect, Acrobat PDF inspect, Substance project inspect).
- [x] `get_capability` returns on-demand parameter/operation/example guides for high-value semantic calls while `search_capabilities` remains lean.
- [x] `creative.runtime.limits` exposes known Adobe host/tooling ceilings and preferred fallbacks to prevent repeated agent failures.
- [x] Codex/Claude one-prompt agent playbook covering token-efficient asset analysis, EditSpec jobs, review/repair, crash safety and host API ceilings.
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
- [x] Typed timeline assembly from explicit source ranges, tracks, placement times and insert/overwrite modes.
- [x] Typed insert/overwrite assembly plus move/trim/delete/ripple-delete/set-enabled, QE razor and deterministic lift/extract range emulation (razor boundaries + segment removal + exact ripple shift for extract).
- [x] QE constant speed/reverse/maintain-pitch/ripple plus typed animated Time Remapping Speed keyframes.
- [x] Generic component/property keyframes plus first-class static/animated Crop effect controls.
- [x] Typed QE video/audio effect and transition application with named parameter writes where the installed effect exposes writable properties.
- [x] Lumetri Color apply/inspect with named parameter writes, verified LUT file path handling and compact component/property readback.
- [x] Scriptable Premiere audio surface: clip volume/pan/keyframes/ducking, track mute and per-clip audio effects/transitions. Full Track Mixer/send automation is explicitly documented as a host API ceiling.
- [x] Cross-version caption surface: SRT/project-item import into caption tracks with caption-format mapping; styling/readback limitations are explicit in `creative.runtime.limits` and must be render-verified.
- [x] MOGRT import/inspect, named property writes, compact property readback and best-effort Source Text payload mutation for templates exposing editable text.
- [x] Adobe Media Encoder handoff with explicit .epr preset/output path plus separate native Media Encoder queue adapter; final-file completion is verified by the creative/acceptance runtime.
- [x] High-level rough-cut recipe.
- [x] J/L-cut recipe blueprint with independently addressable audio/video trim operations.
- [x] Beat-cut / music-sync recipe using explicit beat timestamps.
- [x] Social cutdown recipe can create a deterministic target sequence from an explicit Premiere preset, optionally assemble selects, reframe/crop, mix/duck audio, add captions, QA and export.
- [x] Timeline structural QA for gaps, overlaps and suspiciously short video clips plus compact track structure.

## After Effects

- [x] CEP host connection and compact context inspection.
- [x] Typed composition create/configure/duplicate/precompose including dimensions, pixel aspect, duration/frame rate, work area, background/motion-blur settings.
- [x] Typed text/solid/null/shape/camera/light/footage import plus duplicate/remove, parent and move-before/move-after ordering.
- [x] Generic property-path keyframes with temporal easing, interpolation modes, roving/auto-Bezier/continuous controls and expressions.
- [x] Text-layer creation with transform intro animation plus native text animator properties and range-selector keyframes.
- [x] Rectangle/ellipse/arbitrary Bezier shape layers with fills, strokes, trim paths and repeaters.
- [x] Typed masks with shape/feather/opacity/expansion, set/remove track mattes and explicit layer blend-mode control.
- [x] Typed effect add/remove, effect parameter writes and animation-preset (.ffx) application.
- [x] Typed 3D enable/position/orientation/rotation/parent/motion-blur plus camera/light creation and basic options.
- [x] Render queue inspect/add/set/remove plus output path/templates and render/pause/resume/stop controls.
- [x] Kinetic typography recipe.
- [x] Logo reveal recipe.
- [x] Parallax recipe explicitly enables/configures 3D depth layers, creates the camera and includes an eased camera-position move.
- [x] Lower-third and procedural HUD recipes using typed shape/text primitives.
- [x] Composite/VFX recipe covering footage import, typed masks, effects and optional 3D placement.

## Photoshop

- [x] UXP auto-reconnect bridge.
- [x] Compact context inspection.
- [x] Typed active-layer rename/opacity/visibility, duplicate/delete, rotate/scale/translate/skew/flip, front/back ordering, blend mode, clipping mask, grouping and layer creation.
- [x] Explicit `batchPlay` escape hatch retained intentionally for Photoshop Action Manager operations that lack stable typed DOM coverage.
- [x] Typed document create/open/save/crop/resize/duplicate.
- [x] Typed pixel/text/group create, selected grouping, duplicate/delete, transform, front/back ordering, blend mode and clipping-mask controls.
- [x] Text creation/edit supports layer-wide typography plus mixed non-overlapping text-style ranges (font/size/color/tracking/leading/baseline/scale/bold/italic) while preserving the existing text descriptor.
- [x] Typed Photoshop 25+ selection surface: all/deselect/invert, rectangle/ellipse with modes/feathering, contract/expand/feather/grow/smooth, boundary translate/resize/rotate, work-path creation, subject selection and mask-from-selection.
- [x] Typed non-destructive adjustment-layer creation plus direct brightness/contrast, levels, hue/saturation, exposure and vibrance parameter editing; exotic version-specific adjustment schemas intentionally use the verified descriptor escape hatch.
- [x] Smart-object convert, replace contents, relink, edit contents and update-modified operations via typed UXP/batchPlay commands.
- [x] Typed vector-path surface: list/create Bezier subpaths, select/duplicate/remove, convert to selection, stroke/fill and clipping-path operations.
- [x] PNG/JPEG/PSD/PSB save-as to arbitrary local paths through UXP fullAccess entries and Document.saveAs.
- [x] Typed retouch cleanup supports Content-Aware Fill plus path-driven Clone Stamp / Healing Brush strokes, with optional duplicate-before editing; compositing can combine these with masks, transforms, smart objects, adjustments and smart filters.

## Illustrator

- [x] CEP connection and compact context inspection.
- [x] Document create/open/save/saveAs/close plus artboard list/add/configure/activate/remove operations.
- [x] Rectangle/ellipse/polygon plus arbitrary Bezier paths with handles, compound paths and clipping-group construction.
- [x] Move/rotate/scale/z-order plus mathematical alignment to artboard/selection and horizontal/vertical distribution.
- [x] Fill/stroke/opacity, cap/join/dashes, blend modes, linear/radial gradients, existing-pattern fills, graphic-style application and explicit PageItem live-effect XML.
- [x] Point/area/path text create/update with font/size/color/tracking/leading/scales/baseline/stroke, paragraph justification and per-character range styling.
- [x] List/create/place/remove symbols, apply/remove existing patterns and apply existing brushes. Illustrator scripting exposes Brush.applyTo but does not expose brush creation or a stable API to populate pattern-tile artwork, so those are explicit host-model limits.
- [x] Local placed-image trace with preset/options, redraw and optional expansion.
- [x] SVG/PNG/JPEG export plus PDF save with editability/preset controls.
- [x] Logo/vector recipe builds deterministic primitives plus optional wordmark.

## Other Adobe hosts

- [x] InDesign CEP registration/context plus typed document/page/text/image/style/link/export layout compiler.
- [x] Media Encoder 27+ native UXP adapter: fresh context, enqueue/render/stitch/image sequence, queue control, job/log/missing-assets/project-GUID/add-output plus `.epr` preset inspect/validate/folder listing.
- [x] Audition stable scripting surface: typed open/favorite/save/close/transport/loop/multitrack state/marker/command operations; deep effect-rack graph editing is documented as a host API ceiling.
- [x] Animate CEP/JSFL adapter with document create/open/save/publish/export, layer/frame/keyframe/motion-tween/text/alignment operations.
- [x] Lightroom Classic Lua adapter with auto-start/reconnect, catalog/selection inspection, metadata read/write, develop-preset application, rotate/import/virtual-copy/collection and programmatic export operations.
- [x] Acrobat Pro folder-level trusted JavaScript adapter with reconnecting localhost HTTP transport; inspect/open/save/close, insert/delete/replace/extract/rotate pages, watermarks, annotations, forms, flattening and page labels.
- [x] Bridge CEP adapter with selection/inspect, ratings, labels, metadata serialization, copy/move/open and folder browsing.
- [x] Substance 3D Painter Python startup adapter with Qt5/Qt6 reconnect bridge; project open/create/save/copy/close, texture-set resolution/inspection, fill/paint/group layers, material/resource operations, blending/opacity and texture export/preview.

## Installation / operations

- [x] MCP registry metadata declares both custom install discovery variables: `ADOBE_MCP_APP_DIRS` and `ADOBE_MCP_APP_PATHS`.
- [x] Bounded custom/nonstandard Adobe install discovery via standard roots plus `ADOBE_MCP_APP_DIRS` and exact `ADOBE_MCP_APP_PATHS`, with deduplication.
- [x] `npm run release:check` validates adapter sources, UXP manifests, package/no-CI contract and rejects any unexpected implementation partials while reporting external release gates.
- [x] Windows CEP manual install/uninstall.
- [x] No GitHub Actions / CI.
- [~] UXP adapter now supports arbitrary fixed local paths via fullAccess; packaged/manual CCX installer still pending.
- [x] macOS CEP install/uninstall scripts.
- [x] `doctor` verifies Node, ffmpeg/ffprobe, bridge/connected apps, every shipped adapter source, CEP/Lightroom/Acrobat/Substance installs and shared UXP developer mode; UXP host loading itself remains intentionally verified inside Adobe UXP Developer Tool.
- [x] `adobe-mcp-setup --client codex|claude` plus npm convenience scripts use each client CLI and avoid silent overwrite without force.
- [x] npm package `files` includes `dist`, all adapters, docs and scripts; `prepack` enforces both the code suite and release-readiness/version-consistency gate.

## Tests and quality

- [x] MCP entry regression + release gate rejects pre-v2 stdio instance wiring or missing broker cleanup.
- [x] TypeScript 7 explicitly includes Node type declarations; release gate rejects missing `compilerOptions.types: ["node"]`.
- [x] Parser/static replay caught and repaired stale acceptance/Photoshop regression assertions before real-host release validation.
- [x] Catalog coverage regression verifies every advertised capability has an implementation source and no duplicate IDs.
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

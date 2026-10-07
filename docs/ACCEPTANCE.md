# Manual Acceptance Checklist

This is the release gate for a specific machine + Adobe-version combination. The automated tests cover compiler/runtime logic; these checks prove that the installed host APIs actually behave as expected.

Record the Adobe app versions, OS version, Node version and the final commit SHA next to any completed run.

## Global preflight

- [ ] `npm install`
- [ ] `npm run check`
- [ ] `npm run doctor` reports no hard failures.
- [ ] `ffmpeg -version` and `ffprobe -version` work when video/audio review is required.
- [ ] Start `adobe-mcp`.
- [ ] Open `http://127.0.0.1:38470/health` locally and confirm `ok: true`.
- [ ] Open a supported Adobe host after MCP startup; confirm it appears connected without restarting MCP.
- [ ] Close and reopen that Adobe host; confirm it reconnects without restarting MCP.

## Premiere Pro smoke test

Use expendable media/project copies.

- [ ] `premiere.context.inspect` returns active project/sequence context.
- [ ] Import two local media files through `premiere.project.manage`.
- [ ] Assemble two explicit source ranges with `premiere.timeline.assemble`.
- [ ] Move and trim one clip with `premiere.timeline.edit`.
- [ ] Change speed on a test clip and verify duration visually.
- [ ] Add one Motion/Opacity keyframe sequence.
- [ ] Apply a common video effect (for example Gaussian Blur) and verify it appears in Effect Controls.
- [ ] Add a transition and verify the cut visually.
- [ ] Apply Lumetri parameters and, if available, a test LUT.
- [ ] Import a known-good MOGRT and write at least one editable property/text value.
- [ ] Import an SRT as a caption track.
- [ ] Set audio level/keyframes and listen for the change.
- [ ] Run `premiere.timeline.qa`; confirm known gaps/short clips are detected.
- [ ] Export through Adobe Media Encoder with a known-good local `.epr` preset.
- [ ] Run `creative.output.validate` on the result.
- [ ] Generate a review pack and inspect the proxy/contact sheet/waveform.

Pass condition: all required edits are visible/audible in Premiere and the exported media validates.

## After Effects smoke test

Use a disposable project.

- [ ] `after-effects.context.inspect` returns the active project/composition.
- [ ] Create a composition.
- [ ] Create text, solid, null, shape, camera and light layers.
- [ ] Duplicate and remove a layer.
- [ ] Animate Position/Scale/Opacity using explicit property paths.
- [ ] Verify temporal easing does not throw on scalar and vector properties.
- [ ] Run the kinetic typography recipe.
- [ ] Run the logo-reveal recipe against a disposable layer.
- [ ] Queue a render with a known-good render/output template or default output module.
- [ ] Inspect the rendered file or frame.

Pass condition: layer/property mutations appear correctly in the comp and a render completes.

## Photoshop smoke test

Developer loading requires Adobe UXP Developer Tool unless a packaged `.ccx` has been produced.

- [ ] Enable UXP Developer Mode.
- [ ] Load `adapters/photoshop-uxp/manifest.json`.
- [ ] Open the Adobe MCP panel once; confirm broker connection.
- [ ] Hide the panel; confirm automation still works.
- [ ] Create a document.
- [ ] Open a local image by absolute path.
- [ ] Resize and crop.
- [ ] Create pixel/text/group layers.
- [ ] Rename, change opacity/visibility, duplicate, rotate and scale a layer.
- [ ] Select subject on a suitable portrait/product image.
- [ ] Create a mask from selection.
- [ ] Apply brightness/contrast or levels.
- [ ] Apply Gaussian Blur and Sharpen on disposable pixels.
- [ ] Replace contents of a Smart Object.
- [ ] Save/export PNG, JPEG and PSD/PSB copies to arbitrary local paths.
- [ ] Close/reopen Photoshop and confirm the adapter reconnects without restarting MCP.

Pass condition: every typed operation completes in Photoshop without requiring raw batchPlay for the tested path.

## Illustrator smoke test

Use a disposable document.

- [ ] `illustrator.context.inspect` returns current document context.
- [ ] Create a document and a second artboard.
- [ ] Create rectangle, ellipse, polygon and arbitrary path.
- [ ] Move, rotate and scale artwork.
- [ ] Change fill/stroke/opacity.
- [ ] Create text.
- [ ] Run the logo/vector-system recipe.
- [ ] Export PNG, JPEG and SVG.
- [ ] Save the native document.

Pass condition: created artwork is editable vector content and exports correctly.

## InDesign smoke test

Current v1 scope is connection/context only.

- [ ] Open InDesign.
- [ ] Confirm universal CEP bridge connects.
- [ ] `indesign.context.inspect` returns compact document context.

Do not claim broader InDesign editing coverage until typed capabilities are implemented and accepted.

## End-to-end one-prompt acceptance

This is the important product test.

1. Copy a real Premiere project to an expendable working path.
2. Prepare:
   - source video/audio
   - one reference video
   - optional logo/MOGRT/LUT/SRT
   - known-good AME `.epr` preset
3. Run `creative.assets.index`.
4. Run `creative.reference.analyze` and inspect its visual artifacts.
5. Expand one or more relevant `creative.recipe.*` recipes.
6. Construct an EditSpec with:
   - `workingFiles` pointing to the copied project
   - explicit deliverable paths
   - measurable acceptance criteria
   - semantic operations only
7. Create the job.
8. Run it with checkpointing enabled.
9. Export.
10. Validate output technically.
11. Generate/register review artifacts.
12. The calling vision-capable agent must inspect the review proxy/contact sheet and listen/reason about audio evidence where available.
13. Submit a review with every required criterion.
14. Deliberately fail one criterion, update/repair the EditSpec, rerun only the required operations, regenerate review artifacts and review again.
15. Confirm the job cannot pass with missing required criteria.
16. Confirm checkpoint restore returns the working project to the saved snapshot.
17. Simulate an interrupted operation by killing the process after operation state becomes `running`; confirm the next run reports `operation_outcome_unknown` and refuses silent replay.

Pass condition: a single user brief can be converted into a persisted job, executed, reviewed, repaired and delivered without MCP restart or uncontrolled destructive replay.

## Known release limitation

A repository commit cannot prove behavior against Adobe versions that are not installed in the development environment. Keep machine/version acceptance records with releases. Unsupported Adobe applications must remain explicitly marked unsupported or context-only rather than routed through fake generic handlers.

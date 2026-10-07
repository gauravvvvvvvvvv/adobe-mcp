# Codex / Claude Code Agent Playbook

This is the operating contract for agents using Adobe MCP. Optimize for one detailed user prompt, low token usage, and self-review before delivery.

## Default workflow

For non-trivial creative work:

1. Check `adobe_status`.
2. Use `creative.assets.analyze` for folders/large source sets, or `creative.assets.index` for a few files.
3. Use `creative.reference.analyze` for reference videos; use `creative.audio.analyze` when music/dialogue rhythm should drive cut timing.
4. Use `creative.assets.review` on shortlisted media, inspect contact sheets first, and request proxies only for finalists.
5. Search/expand a professional recipe when one fits.
6. Build a compact EditSpec with explicit deliverables and acceptance criteria.
7. Validate and create the creative job.
8. Run it with checkpointing enabled.
9. Render/export.
10. Validate the actual output file.
11. Generate review artifacts.
12. Actually inspect proxy/contact-sheet/waveform evidence.
13. Record `creative.job.review`.
14. If anything fails, call `creative.repair.plan`, patch only affected operations, rerun and review again.

A successful Adobe command is not a successful edit.

## Token-efficiency rules

- Analyze a large media set once; reuse cached paths, fingerprints and duplicate groups.
- Do not ingest full-resolution video just to shortlist shots; reuse `creative.assets.review` artifacts across planning/repair passes.
- Generate contact sheets/proxies only for shortlisted media.
- Pass `knownHash` after the first host-context read.
- Search capabilities narrowly.
- Prefer a recipe or semantic operation over many primitive calls.
- Use `batch_execute` for independent compact mutations and keep its default `resultMode: "compact"`; request `"full"` only when exact host readback is necessary.
- Persist state in one creative job instead of repeating it in prompts.

## Master video edits

Plan story/selects first, derive local rhythm/silence evidence when useful, assemble, run timeline QA, refine trims/J-L/beat cuts, add B-roll/graphics, use AE where it genuinely helps, mix, grade, caption, export, validate, review, then repair.

Never call something "master level" merely because many operations executed.

## Motion/VFX

Use AE semantic operations for editable typography, shapes, masks/mattes, effects, 3D scenes, parallax, camera motion and compositing. Render a proxy and inspect it before completion.

## Photoshop

Use typed DOM commands first. Keep Smart Objects and adjustment layers non-destructive where possible. Mixed typography belongs in `photoshop.text.manage` `styleRanges`. Use descriptor fallback only for genuine API gaps.

## Illustrator

Keep generated artwork vector/editable. Prefer deterministic paths, appearances, typography, symbols and alignment. Trace raster artwork only when raster-to-vector conversion is intended.

## Recovery

- Put editable project files in `workingFiles`.
- Leave automatic checkpoints on.
- Never blindly replay a persisted `running` operation after a crash; its outcome is unknown.
- Inspect the host before using `resumeUnknown=true`.
- Restore requires explicit confirmation and creates a pre-restore backup.
- The real-host Premiere runner requires an expendable project copy.

## Reconnect behavior

Adobe hosts reconnect to the fixed local broker; opening/reopening a host does not require restarting the MCP. Lightroom/Acrobat poll locally; CEP/UXP/Painter reconnect automatically.

## API ceilings

Do not fake unsupported host behavior. Query `creative.runtime.limits` when a requested operation appears to hit a host/API ceiling. Premiere's legacy API does not expose the entire Audio Track Mixer automation surface; caption styling/readback varies by version; Illustrator cannot reliably author every brush/pattern definition; supported UXP CCX packaging requires Adobe's UXP Developer Tool.

## Delivery rule

Do not present a final deliverable merely because a command succeeded, a file exists, or the project saved. Required structural, technical and creative review must pass first.

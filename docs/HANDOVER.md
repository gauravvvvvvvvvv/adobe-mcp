# AI Handover: Adobe MCP

## Mission

Build `gauravvvvvvvvvv/adobe-mcp` into a local creative-agent runtime for Codex / Claude Code. The user should be able to provide one detailed prompt plus local source/reference media and have the agent plan, edit across Adobe applications, render, inspect its own work, repair failures, validate deliverables, and only then present the result.

The MCP is the **execution/state/verification layer**. Codex/Claude remains the creative reasoning and vision layer.

## Non-negotiable product requirements

1. One MCP registration for the Adobe suite.
2. Opening/restarting an Adobe app must not require restarting the MCP.
3. Do not expose hundreds of low-level MCP tools. Keep the model-facing surface compact.
4. Prefer semantic operations that compile into many native Adobe calls.
5. Reference images/videos must be usable as creative direction.
6. A successful Adobe API call is never sufficient proof of quality.
7. Render/proxy the work, inspect it, machine-validate it, repair problems, and review again.
8. Persist creative jobs so a long edit can be resumed/repaired using one job ID.
9. Minimize token use with compact context, hashes, durable local caches, semantic recipes and batch execution.
10. **No GitHub Actions/CI.** Development, tests, packaging and releases are manual.
11. Do not implement Adobe license/activation bypass. Automation may target any runnable local install that exposes a usable automation surface.

## Repository state

Current architecture:

```
Codex / Claude Code
       |
       | MCP stdio
       v
src/index.ts                         small MCP facade
       |
       +--> src/catalog.ts           compact capability catalog
       +--> src/compilers/*          semantic intent -> host-native scripts
       +--> src/invoke.ts            shared compiled host invocation path
       +--> src/creative-runtime.ts  EditSpec/job/review lifecycle
       +--> src/assets.ts            local asset index
       +--> src/asset-analysis.ts    cached fingerprint/duplicate analysis
       +--> src/media-review.ts      ffmpeg/ffprobe review + QA
       +--> src/state.ts             hashed persistent context cache
       |
       v
src/broker.ts                        localhost WebSocket broker :38470
       |
       +--> adapters/photoshop-uxp
       +--> adapters/media-encoder-uxp
       +--> adapters/lightroom-classic     Lua + HTTP poll
       +--> adapters/acrobat                folder JS + HTTP poll
       +--> adapters/substance-3d-painter   Python + Qt WebSocket
       |
       +--> adapters/cep-universal
             + Premiere Pro
             + After Effects
             + Illustrator
             + InDesign
             + Animate
             + Audition
             + Bridge
```

Persistent state lives under `~/.adobe-mcp/` by default.

## Model-facing MCP tools

Keep this set small. Reusable workflows are discovered through runtime capabilities `creative.recipe.list` / `creative.recipe.expand`, not by adding MCP tools:

- `adobe_status`
- `search_capabilities`
- `get_capability`
- `inspect_context`
- `execute`
- `batch_execute`

Do not add a separate MCP tool for each editing command unless there is a compelling protocol-level reason.

## Creative job loop

Recommended agent behavior:

1. `execute creative.assets.index` for a small source set, or `creative.assets.analyze` for large folders / duplicate-heavy media libraries.
2. Use the compact fingerprint/duplicate manifest to shortlist sources. For reference videos, run `creative.reference.analyze` and inspect its proxy/contact sheet/sampled frames; use scene timings as pacing evidence.
3. Inspect/generate any additional source/reference review artifacts as needed.
4. Construct an EditSpec with explicit acceptance criteria and semantic operations.
5. `execute creative.editspec.validate`
6. `execute creative.job.create`
7. `execute creative.job.run`
8. Render/export.
9. `execute creative.preview.generate`
10. `execute creative.output.validate`
11. Agent actually inspects preview/contact-sheet/waveform.
12. `execute creative.job.review`
13. If failed: call `creative.repair.plan` with the job ID (and failed media validation when available), patch only the affected operations, then revise with `creative.job.update`, rerun, regenerate artifacts, and re-review.
14. Only a passing review completes the job.

## EditSpec principles

EditSpec is an intermediate representation, not a dump of raw Adobe calls. It should capture:

- user prompt
- source/reference assets
- creative intent (story, pacing, palette, typography, sound, constraints)
- deliverables
- acceptance criteria
- ordered semantic operations
- review requirements

Operations should look like `premiere.timeline.assemble` or `after-effects.text.animate`, not 100 primitive property edits.

## Host strategy

### Premiere / After Effects / Illustrator / InDesign / Animate / Audition / Bridge

The universal CEP extension currently owns:

- host detection
- persistent WebSocket reconnect
- serialized `evalScript` queue
- compact context inspection
- a temporary raw-script escape hatch

Professional behavior routes through typed semantic compilers in `src/compilers/`. Premiere, After Effects, Illustrator, InDesign, Animate, Audition and Bridge have semantic compiler coverage. Raw ExtendScript remains an internal implementation detail and should not normally be generated by the external agent.

### Lightroom Classic

Lightroom Classic uses a Lua SDK startup plugin and the broker's localhost HTTP-poll transport. It supports compact catalog/selection inspection, metadata read/write, develop preset application, rotation, imports, virtual copies, collections and programmatic exports. It reconnects automatically when the MCP daemon returns.

### Acrobat

Acrobat Pro uses a folder-level trusted JavaScript because Acrobat restricts network/filesystem APIs outside trusted application context. It polls the broker and exposes page manipulation, save/open, watermarks, annotations, forms, flattening and page-label operations. Reader is not treated as a full write-capable host.

### Substance 3D Painter

Painter uses a Python startup plugin and Qt WebSockets. The plugin targets the current `substance_painter` API and supports project lifecycle, texture sets/stacks, layer creation and properties, resource/material search/application and texture export. Layer mutations use `ScopedModification` to collapse history and texture recomputation.

### Illustrator scripting limitations

The typed Illustrator compiler covers document/artboard lifecycle, Bezier/compound/clipping vector construction, transform/alignment, rich appearance/graphic styles, point/area/path typography, symbols, existing patterns/brushes, image trace and export. Illustrator's scripting object model can apply existing brushes but cannot create brush definitions, and it does not expose a stable documented way to populate arbitrary artwork into a new Pattern object. Keep those limitations explicit instead of relying on locale/version-sensitive menu-command hacks.

### Media Encoder

Media Encoder 27+ uses a native UXP adapter with render-queue enqueue/render/stitch, queue control, job/log/missing-asset inspection and project GUID lookup. Prefer this adapter for direct queue management; Premiere can still hand sequences to AME through its encoder API.

### Photoshop

Photoshop uses UXP.

- prefer DOM for common operations
- typed UXP coverage now includes document create/open/resize/crop/save, common layer/text operations, selections, common adjustments/filters, smart-object replacement and PNG/JPEG/PSD/PSB save-as
- the plugin requests `localFileSystem: fullAccess` because autonomous Codex/Claude jobs must address fixed arbitrary local paths without file-picker interaction; installation therefore requires explicit user consent
- use `batchPlay` when the DOM does not expose an operation
- keep generic descriptors as escape hatch
- replace remaining common descriptors with typed semantic handlers over time

## Token-efficiency rules

- Search capabilities only when needed.
- Never return complete project graphs by default.
- Use stable object IDs and paging for large projects.
- Context snapshots are SHA-256 hashed; callers should pass `knownHash`.
- Do not include context in `adobe_status`.
- Prefer `creative.recipe.expand` plus a small EditSpec over rebuilding common workflows from primitive calls.
- Return changed IDs/ranges/warnings, not whole timelines/documents.
- Run `creative.assets.analyze` once for large media sets; its cache is keyed by path/size/mtime and returns compact exact/near-duplicate evidence.
- Generate contact sheets/proxies only for shortlisted assets instead of forcing the agent to repeatedly ingest source-resolution video.
- Persist recipe/job/state data on disk rather than repeating it in the conversation.

## Verification philosophy

There are four levels:

1. **Command verification**: did the host API call succeed?
2. **Structural verification**: does the project/timeline/document state match the requested structure?
3. **Media verification**: does the rendered file have the expected streams, dimensions, FPS, duration, codec, audio, etc.?
4. **Creative visual/audio review**: does it actually look/sound good and satisfy the brief/reference?

A final job must not rely only on level 1.

## Crash and rollback safety

- Operation state is persisted as `running` before contacting an Adobe host.
- If MCP/Adobe dies before the result is received, that operation has an **unknown outcome**.
- A later `creative.job.run` refuses to replay it by default. The agent must inspect the host/project and explicitly set `resumeUnknown=true` only when retrying is safe.
- `workingFiles` are automatically snapshotted per revision before job execution when present.
- `creative.job.checkpoint` can create additional file checkpoints.
- `creative.job.restore` requires `confirm=true` and creates a pre-restore backup before overwriting a working file.
- Preview/review/deliverable files belong in the persistent job artifact manifest.

## Coding rules

- TypeScript strict mode.
- Generated ExtendScript values must be JSON-escaped; never concatenate untrusted raw literals.
- Serialize CEP `evalScript` execution.
- Fail honestly on unsupported host APIs instead of silently approximating destructive behavior.
- Group edits into an undo group when the host supports it.
- Favor deterministic helpers and recipes over repeated agent-generated scripts.
- Keep runtime failures recoverable and jobs resumable.
- Update `docs/TASKS.md` **in every implementation commit**.
- Keep `docs/HANDOVER.md` current when architecture/contracts change.
- Do not create `.github/workflows`.

## Development commands

```bash
npm install
npm run typecheck
npm run build
npm run doctor
npm run dev
```

Windows CEP install:

```powershell
npm run install:windows
```

Photoshop development adapter: load `adapters/photoshop-uxp/manifest.json` through UXP Developer Tool.

## Source/reference implementations already studied

Useful public implementation references during current work:

- `hetpatel-11/Adobe_Premiere_Pro_MCP`: broad Premiere ExtendScript/CEP coverage and safe `evalScript` handling.
- `Dakkshin/after-effects-mcp`: basic After Effects ExtendScript examples.
- `alisaitteke/photoshop-mcp`: Photoshop DOM/batchPlay/UXP patterns.
- `spencerhhubert/illustrator-mcp-server`: Illustrator scripting concept.

Do not copy blindly. Normalize behavior into this project's compact semantic architecture.

## Immediate implementation order

Follow the live checklist in `docs/TASKS.md`. The core semantic/runtime work is now largely complete. Current priority is:

1. run the guarded real-host Premiere acceptance scenario on the target workstation and repair any version-specific failures
2. run real-host Photoshop/AE/Illustrator/Painter smoke passes and record host/version behavior
3. package UXP adapters with Adobe's supported UXP Developer Tool workflow on a machine that has it
4. add version-specific fallbacks only when a real host demonstrates a reproducible incompatibility
5. keep `docs/AGENT-PLAYBOOK.md` aligned with workflow changes

## Installation contract

- `npm run install:windows` / `npm run install:macos` install the universal CEP adapter.
- `npm run photoshop:dev:windows` / `npm run photoshop:dev:macos` enable UXP development loading.
- Photoshop distribution packages must be produced as `.ccx` with Adobe UXP Developer Tool; do not hand-roll the ZIP format and call it a supported installer.
- `adobe-mcp-setup --client codex|claude` registers the local stdio server through each client's own CLI. It does not overwrite an existing `adobe` entry without `--force`.
- Run `npm run doctor` after installation.

## Agent operating document

`docs/AGENT-PLAYBOOK.md` is the concise execution contract intended to be given directly to Codex/Claude Code. Keep this handover architectural and the playbook operational.

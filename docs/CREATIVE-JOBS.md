# Creative jobs

The creative-job layer is what lets Codex/Claude treat Adobe MCP as one autonomous editing runtime instead of a collection of app commands.

## Intended agent loop

1. `creative.assets.index`
   - Scan source footage, images, audio, logos and references.
   - ffprobe metadata is added for video/audio when ffprobe is installed.

2. Build an **EditSpec**
   - Original prompt.
   - Source/reference assets.
   - Creative intent.
   - Deliverables.
   - Acceptance criteria.
   - Ordered semantic operations.
   - Review requirements.

3. `creative.editspec.validate`

4. `creative.job.create`
   - Stores the spec under `~/.adobe-mcp/jobs/<job-id>.json`.

5. `creative.job.run`
   - Executes semantic operations against connected Adobe adapters.
   - Successful operations are remembered, so a retry can skip them.

6. Render/export preview artifacts as operations in the EditSpec.

7. The **calling agent must actually inspect those artifacts**.
   - It can use its own vision/audio/file capabilities.
   - Adobe MCP does not pretend that an API success means the output looks good.

8. `creative.job.review`
   - Record criterion-by-criterion verdicts and artifact paths.
   - A failing review marks the job `needs_repair`.

9. Repair
   - Generate a revised EditSpec.
   - `creative.job.update`.
   - Run again.
   - Review again.

10. A passing review marks the job `completed`.

## Why the model remains the creative brain

Codex/Claude already has the reasoning layer. Duplicating a model inside the MCP would increase cost, latency and complexity. Adobe MCP instead provides deterministic state, durable job memory, asset metadata, native Adobe execution and review bookkeeping.

This means one user prompt can still produce multiple internal edit/review/repair passes without the user manually driving those steps.

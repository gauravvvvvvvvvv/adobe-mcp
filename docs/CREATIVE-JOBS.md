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

6. Export a preview/final file and call `creative.preview.generate`.
   - Low-resolution H.264 review proxy.
   - Sampled contact sheet spanning the video.
   - Audio waveform when an audio stream exists.
   - These are generated locally with ffmpeg.

7. Call `creative.output.validate`.
   - File existence/size.
   - Decodable media streams.
   - Dimensions.
   - FPS.
   - Duration/tolerance.
   - Codec.
   - Required audio.

8. The **calling agent must actually inspect the review artifacts**.
   - Use its own vision/audio/file capabilities.
   - Adobe MCP never treats an API return or successful render as proof of visual quality.

9. `creative.job.review`
   - Record criterion-by-criterion verdicts and reviewed artifact paths.
   - A passing review is rejected unless every required acceptance criterion is explicitly passed.
   - If visual review is required, a pass is rejected without artifacts.
   - A failing review marks the job `needs_repair`.

10. Repair
   - Generate a revised EditSpec.
   - `creative.job.update`.
   - Run again.
   - Generate new review artifacts.
   - Review again.

11. A passing review marks the job `completed`.

## Why the model remains the creative brain

Codex/Claude already has the reasoning layer. Duplicating a model inside the MCP would increase cost, latency and complexity. Adobe MCP instead provides deterministic state, durable job memory, asset metadata, native Adobe execution, review artifacts, machine QA and review bookkeeping.

This means one user prompt can still produce multiple internal edit/review/repair passes without the user manually driving those steps.

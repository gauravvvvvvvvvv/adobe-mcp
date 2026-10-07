# Architecture

Adobe MCP is designed around one persistent local MCP process and thin per-application host adapters.

## Goals

- One MCP registration for the whole Adobe suite.
- Opening or restarting an Adobe app must not require restarting MCP.
- Small MCP tool surface to reduce model context and token use.
- High-level semantic commands compile into many native host operations.
- Localhost-only transport. No cloud relay is required.
- App adapters can reconnect independently.
- Arbitrary local install paths are supported through discovery/configuration; licensing and activation are not bypassed.

## Layers

1. **MCP facade**
   - Exposes only: status, capability search, capability lookup, context inspection, execute and batch execute.
   - Avoids advertising hundreds of low-level tools through `tools/list`.

2. **Capability catalog**
   - Compact stable IDs such as `premiere.timeline.edit` and `after-effects.properties.animate`.
   - Agents search the catalog only when needed.

3. **Local broker**
   - Binds to fixed localhost endpoint `127.0.0.1:38470`.
   - Host adapters connect via WebSocket and announce app/version/capabilities.
   - Connections can disappear/reappear without MCP restart.
   - Commands carry an ID and return a compact result.
   - Host context events are cached.

4. **Host adapters**
   - Premiere Pro: CEP first for broad compatibility; UXP adapter where available.
   - After Effects: ExtendScript through the universal CEP bridge initially.
   - Photoshop: UXP + `batchPlay`.
   - Illustrator/InDesign: universal CEP + ExtendScript initially.
   - Animate: JSFL.
   - Lightroom Classic: Lua plugin SDK.
   - Acrobat: Acrobat JavaScript/host automation.
   - Substance 3D: product-specific Python/plugin APIs.
   - Media Encoder/Audition: product-specific bridge/API where exposed, with narrower capability guarantees.

5. **Optional operator fallback**
   - For operations not exposed by Adobe scripting/plugin APIs, a future opt-in accessibility/UI layer may invoke menus/panels.
   - It is deliberately lower priority because it is brittle and cannot honestly guarantee every interactive feature.

## Token-efficiency rules

- Never expose a 200-500 tool schema catalog by default.
- Use short capability IDs and compact JSON results.
- Persist compact host context to `~/.adobe-mcp/context-cache.json`.
- Every context snapshot has a SHA-256 `contextHash`.
- Agents pass the previous hash as `knownHash`; unchanged contexts return metadata only.
- `adobe_status` never dumps project context.
- Refresh context only on host events or explicit `fresh=true`.
- Prefer one semantic command over dozens of low-level MCP calls.
- Use `batch_execute` for deterministic multi-step work.
- Host adapters should return IDs, changed ranges/layers/clips and warnings, not full project dumps.
- Large project graphs should be paged or addressed by stable IDs.
- Preview images/renders should be requested only when visual verification is needed.

## Non-goal

The project does not crack, patch, activate, or bypass Adobe licensing. If an installed application is runnable and exposes an automation surface, Adobe MCP can attempt to automate it regardless of where it is installed.

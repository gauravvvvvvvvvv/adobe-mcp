# Adobe MCP

A local-first MCP server for controlling Adobe creative applications through one compact, state-aware interface.

The current v0.1 runtime covers **Premiere Pro, After Effects, Photoshop, Illustrator, Media Encoder, Audition, InDesign, Animate, Lightroom Classic, Acrobat Pro, Bridge and Substance 3D Painter** through the best local automation surface each host exposes.

## Why this architecture

Most MCP integrations expose hundreds of tiny tools. That wastes context and forces the model to spend tokens rediscovering obvious workflows.

Adobe MCP exposes a small stable surface:

- `adobe_status`
- `search_capabilities`
- `get_capability`
- `inspect_context`
- `execute`
- `batch_execute`

The AI searches compact capability IDs such as `premiere.timeline.edit`, then sends one semantic instruction to the connected host adapter. The adapter expands it into the native Adobe calls required to perform the edit.

## No-refresh design

The MCP process owns a localhost bridge at `ws://127.0.0.1:38470`. Adobe host adapters connect to it and automatically reconnect. You can start MCP first, open Photoshop later, close Premiere, reopen After Effects, etc. The MCP server does not need to be restarted just because an Adobe application changed.

The bridge port is intentionally fixed instead of silently hopping ports, because installed host adapters need a stable localhost endpoint.

Health endpoint:

`http://127.0.0.1:38470/health`

## Current state

v0.1 includes:

- universal MCP facade
- compact capability search instead of hundreds of advertised tools
- localhost WebSocket broker with automatic adapter reconnect
- persistent hashed host context cache
- local Adobe install discovery
- Photoshop UXP adapter
- universal CEP adapter for Premiere Pro, After Effects, Illustrator, InDesign, Animate, Audition and Bridge
- Media Encoder UXP, Lightroom Classic Lua, Acrobat trusted-JavaScript and Substance 3D Painter Python adapters
- Windows and macOS install/uninstall scripts for local host adapters
- persistent EditSpec jobs with checkpoint/rollback, artifact manifests and crash-safe resume
- cached bulk source fingerprinting/duplicate detection plus reference-video scene/pacing/silence/loudness analysis
- reusable professional edit/motion/compositing recipes
- typed Premiere, After Effects, Photoshop and Illustrator semantic operations

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/CAPABILITIES.md](docs/CAPABILITIES.md), and [docs/AGENT-PLAYBOOK.md](docs/AGENT-PLAYBOOK.md).

## Manual development

There are deliberately **no CI workflows** in this repository.

```bash
npm install
npm run typecheck
npm run build
npm run doctor
npm run dev
```

### Windows CEP install

From PowerShell in the repository:

```powershell
npm run install:windows
```

This copies the universal CEP bridge into the current user's Adobe CEP extensions directory and enables CEP local-development mode. Restart an already-running supported Adobe host once so it discovers the newly installed extension.

For Photoshop development, enable UXP Developer Mode and load `adapters/photoshop-uxp/manifest.json` with Adobe UXP Developer Tool:

```powershell
npm run photoshop:dev:windows
```

On macOS:

```bash
npm run photoshop:dev:macos
```

Adobe's UXP packaging flow produces a `.ccx` through UXP Developer Tool. This repository does not fake a hand-built CCX; see `docs/INSTALL.md`.

MCP client configuration after a local/global package install:

```json
{
  "mcpServers": {
    "adobe": {
      "command": "adobe-mcp"
    }
  }
}
```

## Local application discovery

Adobe MCP scans common local application folders and supports extra paths through `ADOBE_MCP_APP_DIRS`.

It does not depend on Creative Cloud being the install source. It also does not crack, patch, activate or bypass Adobe licensing.

## Coverage philosophy

"Control every feature" is treated as an engineering target, not a fake promise. Adobe exposes different automation surfaces across products and versions. Native APIs come first, then host scripting/command IDs, with an optional UI/operator fallback reserved for features that Adobe does not expose programmatically.

## License

MIT


## Configure Codex or Claude Code

After installing/linking the package so `adobe-mcp` is on PATH:

```bash
adobe-mcp-setup --client codex
adobe-mcp-setup --client claude
```

Use `--force` only when you intentionally want to replace an existing MCP server named `adobe`.

## Reality check

The core creative workflow is implemented and testable without exposing hundreds of model-facing tools. Real-host acceptance still depends on the Adobe versions installed on the target machine. Run `npm run doctor`, then follow `docs/ACCEPTANCE.md` before treating a particular host/version combination as production-verified.

## One-prompt creative jobs

Codex/Claude should treat Adobe MCP as an execution, state, and verification runtime rather than a bag of low-level tools. For a large video job it should analyze sources, build one EditSpec, checkpoint the working project, run semantic operations, export, validate, generate review artifacts, visually inspect them, and repair failures before delivery.

See `docs/AGENT-PLAYBOOK.md` for the operating contract.

For a real Premiere workstation acceptance pass:

```bash
npm run accept:premiere -- --scenario D:/path/to/acceptance.json
```

Start from `docs/acceptance-premiere.example.json` and use an expendable project copy.

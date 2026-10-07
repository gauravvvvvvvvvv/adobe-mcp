# Adobe MCP

A local-first MCP server for controlling Adobe creative applications through one compact, state-aware interface.

The project is starting with **Premiere Pro, After Effects, Photoshop and Illustrator**, then expands to Media Encoder, Audition, InDesign, Animate, Lightroom Classic, Acrobat, Bridge and Substance 3D products where useful automation APIs exist.

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

The MCP process owns a localhost bridge. Adobe host adapters connect to it and automatically reconnect. You can start MCP first, open Photoshop later, close Premiere, reopen After Effects, etc. The MCP server does not need to be restarted just because an Adobe application changed.

Default bridge:

`ws://127.0.0.1:38470`

Health endpoint:

`http://127.0.0.1:38470/health`

If the default port is occupied, the broker advances to the next free port for the current process.

## Current state

v0.1 lays down the universal broker, capability catalog, local install discovery and MCP facade. The next commits add the actual host adapters, beginning with Photoshop UXP, Premiere CEP, After Effects ExtendScript/ScriptUI and Illustrator scripting.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/CAPABILITIES.md](docs/CAPABILITIES.md).

## Manual development

There are deliberately **no CI workflows** in this repository.

```bash
npm install
npm run typecheck
npm run build
npm run doctor
npm run dev
```

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

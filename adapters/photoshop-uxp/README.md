# Photoshop UXP adapter

This is the first live host adapter for Adobe MCP.

## Development install

Load `manifest.json` with Adobe UXP Developer Tool, then open the **Adobe MCP** panel in Photoshop once. The adapter keeps its WebSocket connection alive when the panel is hidden and reconnects automatically when the MCP process appears.

The adapter currently implements:

- compact context inspection
- active-layer rename
- active-layer opacity
- active-layer visibility
- generic `batchPlay` descriptors as a temporary broad escape hatch for the remaining Photoshop semantic capabilities

Typed semantic handlers will replace common raw descriptors over time so agents do not need to generate verbose Action Manager payloads for routine edits.

The bridge only talks to `127.0.0.1:38470`.

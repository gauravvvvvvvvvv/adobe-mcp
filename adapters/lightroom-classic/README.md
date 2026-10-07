# Lightroom Classic adapter

Adobe MCP uses a Lightroom Classic SDK Lua plug-in. Lightroom Classic's SDK provides async tasks and HTTP, so this adapter uses the broker's localhost HTTP-poll transport instead of assuming a WebSocket/LuaSocket runtime.

Supported semantic operations through `lightroom-classic.catalog.manage`:

- `inspect`: catalog path and compact current selection.
- `metadata.get` / `metadata.set`: metadata for selected photos or explicit `paths`.
- `develop.apply`: build/apply a temporary develop preset from a settings table.
- `rotate`: left/right rotation.
- `import`: add local files to the active catalog.
- `virtualCopies`: create virtual copies of the current selection.
- `collection.create`: create a collection and optionally add selected photos.
- `export`: programmatic export through `LrExportSession`.

The plug-in starts its bridge task through `LrInitPlugin`, sends compact context every few seconds, and automatically resumes communication when Adobe MCP is restarted.

# Substance 3D Painter adapter

This is an always-loaded Python startup plugin for Adobe Substance 3D Painter. Painter 10.1+ uses PySide6/Qt6; older supported versions fall back to PySide2/Qt5. The plugin opens a localhost WebSocket to Adobe MCP and automatically reconnects.

The single capability is `substance-3d.project.automate`. Its typed operations include:

- `inspect`
- `project.open`, `project.create`, `project.save`, `project.saveAs`, `project.saveCopy`, `project.close`
- `texturesets.inspect`, `textureset.resolution`
- `layers.inspect`
- `layer.fill`, `layer.paint`, `layer.group`, `layer.set`, `layer.material`
- `resource.search`, `resource.project`
- `export.preview`, `export.textures`

Layer edits are wrapped in Painter's `ScopedModification` where appropriate so one semantic MCP operation produces one coherent history step and minimizes recomputation.

An explicit `python.evaluate` escape hatch exists only with `allow: true` for API gaps. Normal agents should use typed operations.

Windows installation places the startup module under the user's Documents/Adobe/Adobe Substance 3D Painter/python/startup directory. macOS uses the corresponding Documents path. Restart Painter once after initial installation; after that the adapter reconnects whenever Adobe MCP restarts.

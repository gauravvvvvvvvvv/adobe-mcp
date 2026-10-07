# Media Encoder UXP adapter

Native UXP bridge for Adobe Media Encoder 27+.

It implements `media-encoder.queue.manage` with:

- queue status/start/pause/stop/stop-current/remove-all
- enqueue without starting
- enqueue and render immediately
- stitch multiple source files
- image-sequence enqueue
- job summary lookup
- render log lookup
- missing-asset validation
- Premiere/After Effects project item GUID discovery
- additional output creation for an existing job group

The adapter connects only to the local Adobe MCP WebSocket broker and reconnects automatically.

During development load `manifest.json` through UXP Developer Tool after enabling **Media Encoder > Preferences > Plugins > Developer mode**. Media Encoder must be restarted once after changing that developer-mode preference.

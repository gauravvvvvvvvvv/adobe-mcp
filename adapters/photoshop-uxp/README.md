# Photoshop UXP adapter

The Photoshop adapter connects to the local Adobe MCP broker at `127.0.0.1:38470`, keeps the socket alive while its panel is hidden, and reconnects automatically.

## Typed coverage

Current typed operations include:

- document create/open/resize/crop/duplicate/save
- pixel/text/group creation
- active-layer rename/opacity/visibility/duplicate/delete/rotate/scale/grouping
- text create/content/size basics
- selection all/deselect/invert/rectangle/ellipse/select-subject
- mask from selection
- brightness/contrast and levels
- Gaussian Blur and Sharpen
- Smart Object replace-contents
- PNG/JPEG/PSD/PSB save-as
- generic `batchPlay` descriptors as an escape hatch for operations not yet typed

The manifest requests `localFileSystem: fullAccess` because an autonomous local agent needs to address explicit local source/output paths without opening a file picker for every operation. Installation/loading therefore requires explicit user consent.

## Local development install

Windows:

```powershell
npm run photoshop:dev:windows
```

macOS:

```bash
npm run photoshop:dev:macos
```

Then add `manifest.json` in Adobe UXP Developer Tool and load the plugin in Photoshop.

## Distribution

Adobe-supported UXP distribution uses a `.ccx` package produced by UXP Developer Tool. Package this adapter through UDT rather than hand-assembling a ZIP.

See `docs/INSTALL.md` and `docs/ACCEPTANCE.md`.

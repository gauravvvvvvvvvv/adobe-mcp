# Installation

Adobe MCP is a local stdio MCP server plus host adapters. There is no cloud relay and no GitHub Actions release pipeline.

## 1. Install/build the MCP

From a clone:

```bash
npm install
npm run check
npm link
```

Or after the package is published:

```bash
npm install -g @parryhotter/adobe-mcp
```

The `adobe-mcp` executable must be on PATH before registering it with Codex/Claude Code.

## 2. Install the CEP bridge

### Windows

```powershell
npm run install:windows
```

This installs the universal CEP bridge for Premiere Pro, After Effects, Illustrator, InDesign, Animate, Audition and Bridge. The same script also installs the Lightroom Classic Lua plugin, Acrobat folder-level JavaScript and Substance 3D Painter Python startup plugin when their sources are present.

### macOS

```bash
npm run install:macos
```

The installer enables local CEP development mode for CSXS 9 through 15. Existing debug-mode settings are never removed by uninstall because other local extensions may depend on them. Restart each newly installed host once so it discovers its adapter; after discovery, MCP restarts do not require host restarts.

## 3. Photoshop UXP bridge

Photoshop uses UXP rather than the universal CEP adapter.

### Development/local use

Windows (run the shell elevated if Adobe's shared UXP settings folder requires it):

```powershell
npm run photoshop:dev:windows
```

macOS:

```bash
npm run photoshop:dev:macos
```

Then open Adobe UXP Developer Tool, choose **Add Plugin**, select:

```
adapters/photoshop-uxp/manifest.json
```

Load the plugin in Photoshop and open its **Adobe MCP** panel once. The WebSocket remains alive while the panel is hidden and automatically reconnects to the MCP broker.

### Independent .ccx package

Adobe documents `.ccx` as the installable UXP package and recommends creating it with UXP Developer Tool's **Package** action. Do that from the same `adapters/photoshop-uxp` project, then double-click the generated `.ccx` to install through Creative Cloud Desktop.

Do not rename a ZIP to `.ccx` and treat it as supported packaging.

## 4. Media Encoder UXP bridge

Media Encoder 27+ uses its own UXP adapter. In UXP Developer Tool, choose **Add Plugin** and select:

```
adapters/media-encoder-uxp/manifest.json
```

Load it in Media Encoder. It reconnects to the same local broker and exposes queue/job operations. Keep UXP Developer Mode enabled for local development loading.

## 5. Lightroom Classic, Acrobat and Substance 3D Painter

The Windows/macOS installer scripts also install:

- Lightroom Classic: `AdobeMCP.lrplugin` into the Lightroom Modules folder.
- Acrobat Pro: `AdobeMCP.js` as a folder-level trusted JavaScript.
- Substance 3D Painter: `adobe_mcp.py` under the Painter `python/startup` directory.

Restart each of those applications once after the initial install. Lightroom and Acrobat reconnect using localhost HTTP polling; Painter uses a Qt WebSocket.

## 6. Register the MCP

### Codex

```bash
adobe-mcp-setup --client codex
```

Equivalent CLI shape:

```bash
codex mcp add adobe -- adobe-mcp
```

Setup reads the entry back with `codex mcp get adobe` before reporting success.

### Claude Code

```bash
adobe-mcp-setup --client claude
```

Claude Code defaults to user scope so Adobe MCP is available across projects. Override it when desired:

```bash
adobe-mcp-setup --client claude --scope local
adobe-mcp-setup --client claude --scope project
```

Setup registers an explicit `stdio` transport and reads the configuration back with `claude mcp get adobe`. Native Windows uses `cmd /c` around the stdio executable. Use `--force` only to replace the `adobe` entry in the selected scope.

## 7. Verify

```bash
npm run doctor
```

Then start the MCP:

```bash
adobe-mcp
```

Open the desired Adobe application. The host bridge connects to `127.0.0.1:38470`. Opening or restarting an Adobe app does not require restarting the MCP.

## ffmpeg

Reference analysis, proxies, contact sheets, waveform generation and deterministic video/audio validation require both `ffmpeg` and `ffprobe` on PATH.

## Custom / nonstandard application locations

Host adapter installation is user-level and does not depend on Creative Cloud's default application directory. `doctor` scans standard locations only for diagnostics.

For additional parent folders:

```text
ADOBE_MCP_APP_DIRS=D:\\CreativeApps;E:\\Adobe
```

For exact application folders or executables outside normal roots:

```text
ADOBE_MCP_APP_PATHS=D:\\PortableApps\\Adobe Premiere Pro;E:\\Tools\\Photoshop
```

Use the platform path delimiter (`;` on Windows, `:` on macOS/Linux). These variables only improve local install discovery; they do not alter licensing or activation.

## Licensing

Adobe MCP automates runnable local applications through their available automation surfaces. It does not activate, crack, patch or bypass Adobe licensing.

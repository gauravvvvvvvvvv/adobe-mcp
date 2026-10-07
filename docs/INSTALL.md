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

This installs the single CEP bridge for Premiere Pro, After Effects, Illustrator and InDesign into the current user's CEP extensions folder.

### macOS

```bash
npm run install:macos
```

The installer enables local CEP development mode for CSXS 9 through 15. Existing debug-mode settings are never removed by uninstall because other local extensions may depend on them.

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

## 4. Register the MCP

### Codex

```bash
adobe-mcp-setup --client codex
```

Equivalent CLI shape:

```bash
codex mcp add adobe -- adobe-mcp
```

### Claude Code

```bash
adobe-mcp-setup --client claude
```

This installs at Claude Code user scope. Native Windows uses `cmd /c` around the stdio executable, matching Claude Code's Windows MCP requirement.

## 5. Verify

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

## Licensing

Adobe MCP automates runnable local applications through their available automation surfaces. It does not activate, crack, patch or bypass Adobe licensing.

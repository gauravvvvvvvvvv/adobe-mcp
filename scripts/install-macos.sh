#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CEP_SOURCE="$REPO_ROOT/adapters/cep-universal"
CEP_ROOT="$HOME/Library/Application Support/Adobe/CEP/extensions"
CEP_TARGET="$CEP_ROOT/com.gaurav.adobe-mcp"

if [[ ! -f "$CEP_SOURCE/CSXS/manifest.xml" ]]; then
  echo "CEP adapter not found at $CEP_SOURCE" >&2
  exit 1
fi

echo "Installing Adobe MCP universal CEP bridge..."
mkdir -p "$CEP_ROOT"
rm -rf "$CEP_TARGET"
cp -R "$CEP_SOURCE" "$CEP_TARGET"

echo "Enabling CEP local-development mode for current user..."
for version in {9..15}; do
  defaults write "com.adobe.CSXS.$version" PlayerDebugMode 1 >/dev/null 2>&1 || true
done

echo
echo "Installed CEP bridge to:"
echo "  $CEP_TARGET"
echo
echo "Restart any currently open Premiere Pro / After Effects / Illustrator / InDesign instance once so it discovers the extension."
echo "After discovery, the adapter reconnects automatically whenever Adobe MCP is running."
echo
echo "Photoshop uses adapters/photoshop-uxp and must be loaded once through Adobe UXP Developer Tool during development."

LIGHTROOM_SOURCE="$REPO_ROOT/adapters/lightroom-classic/AdobeMCP.lrplugin"
LIGHTROOM_ROOT="$HOME/Library/Application Support/Adobe/Lightroom/Modules"
LIGHTROOM_TARGET="$LIGHTROOM_ROOT/AdobeMCP.lrplugin"
if [[ -f "$LIGHTROOM_SOURCE/Info.lua" ]]; then
  echo
  echo "Installing Lightroom Classic Adobe MCP plugin..."
  mkdir -p "$LIGHTROOM_ROOT"
  rm -rf "$LIGHTROOM_TARGET"
  cp -R "$LIGHTROOM_SOURCE" "$LIGHTROOM_TARGET"
  echo "  $LIGHTROOM_TARGET"
fi

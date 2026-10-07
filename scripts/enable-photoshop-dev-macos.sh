#!/usr/bin/env bash
set -euo pipefail

SETTINGS_DIR="/Library/Application Support/Adobe/UXP/Developer"
SETTINGS="$SETTINGS_DIR/settings.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Enabling Adobe UXP Developer Mode (administrator permission may be required)..."
sudo mkdir -p "$SETTINGS_DIR"
printf '%s\n' '{"developer":true}' | sudo tee "$SETTINGS" >/dev/null

echo
echo "UXP Developer Mode enabled at:"
echo "  $SETTINGS"
echo
echo "Open Adobe UXP Developer Tool, Add Plugin, and select:"
echo "  $REPO_ROOT/adapters/photoshop-uxp/manifest.json"
echo
echo "Adobe requires UXP Developer Tool for loading an unpackaged plugin and for producing a .ccx installer."

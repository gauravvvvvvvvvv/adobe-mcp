#!/usr/bin/env bash
set -euo pipefail

CEP_TARGET="$HOME/Library/Application Support/Adobe/CEP/extensions/com.gaurav.adobe-mcp"

if [[ -d "$CEP_TARGET" ]]; then
  rm -rf "$CEP_TARGET"
  echo "Removed $CEP_TARGET"
else
  echo "Adobe MCP CEP bridge is not installed at $CEP_TARGET"
fi

echo "CEP PlayerDebugMode values were left unchanged because other local extensions may rely on them."

LIGHTROOM_TARGET="$HOME/Library/Application Support/Adobe/Lightroom/Modules/AdobeMCP.lrplugin"
[[ -d "$LIGHTROOM_TARGET" ]] && rm -rf "$LIGHTROOM_TARGET" && echo "Removed $LIGHTROOM_TARGET"
ACROBAT_TARGET="$HOME/Library/Application Support/Adobe/Acrobat/DC/JavaScripts/AdobeMCP.js"
[[ -f "$ACROBAT_TARGET" ]] && rm -f "$ACROBAT_TARGET" && echo "Removed $ACROBAT_TARGET"

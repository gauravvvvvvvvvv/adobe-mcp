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

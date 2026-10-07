$ErrorActionPreference = "Stop"
$CepTarget = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.gaurav.adobe-mcp"

if (Test-Path -LiteralPath $CepTarget) {
    Remove-Item -LiteralPath $CepTarget -Recurse -Force
    Write-Host "Removed $CepTarget"
} else {
    Write-Host "Adobe MCP CEP bridge is not installed at $CepTarget"
}

Write-Host "CEP PlayerDebugMode values were left unchanged because other local extensions may rely on them."

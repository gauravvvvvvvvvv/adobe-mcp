$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CepSource = Join-Path $RepoRoot "adapters\cep-universal"
$CepRoot = Join-Path $env:APPDATA "Adobe\CEP\extensions"
$CepTarget = Join-Path $CepRoot "com.gaurav.adobe-mcp"

if (-not (Test-Path -LiteralPath (Join-Path $CepSource "CSXS\manifest.xml"))) {
    throw "CEP adapter not found at $CepSource"
}

Write-Host "Installing Adobe MCP universal CEP bridge..."
New-Item -ItemType Directory -Path $CepRoot -Force | Out-Null
if (Test-Path -LiteralPath $CepTarget) {
    Remove-Item -LiteralPath $CepTarget -Recurse -Force
}
Copy-Item -LiteralPath $CepSource -Destination $CepTarget -Recurse -Force

Write-Host "Enabling CEP local-development mode for current user..."
foreach ($version in 9..15) {
    & reg.exe add "HKCU\Software\Adobe\CSXS.$version" /v PlayerDebugMode /t REG_SZ /d 1 /f | Out-Null
}

Write-Host ""
Write-Host "Installed CEP bridge to:"
Write-Host "  $CepTarget"
Write-Host ""
Write-Host "Restart any currently open Premiere Pro / After Effects / Illustrator / InDesign instance once so it discovers the extension."
Write-Host "After that, the panel reconnects to Adobe MCP automatically; restarting the MCP is not required when apps reconnect."
Write-Host ""
Write-Host "Photoshop uses the separate UXP adapter at:"
Write-Host "  $(Join-Path $RepoRoot 'adapters\photoshop-uxp')"
Write-Host "Load its manifest through UXP Developer Tool during development. A packaged manual installer will be added later."

$LightroomSource = Join-Path $RepoRoot "adapters\lightroom-classic\AdobeMCP.lrplugin"
$LightroomRoot = Join-Path $env:APPDATA "Adobe\Lightroom\Modules"
$LightroomTarget = Join-Path $LightroomRoot "AdobeMCP.lrplugin"
if (Test-Path -LiteralPath (Join-Path $LightroomSource "Info.lua")) {
    Write-Host ""
    Write-Host "Installing Lightroom Classic Adobe MCP plugin..."
    New-Item -ItemType Directory -Path $LightroomRoot -Force | Out-Null
    if (Test-Path -LiteralPath $LightroomTarget) { Remove-Item -LiteralPath $LightroomTarget -Recurse -Force }
    Copy-Item -LiteralPath $LightroomSource -Destination $LightroomTarget -Recurse -Force
    Write-Host "  $LightroomTarget"
}

$AcrobatSource = Join-Path $RepoRoot "adapters\acrobat\AdobeMCP.js"
$AcrobatRoot = Join-Path $env:APPDATA "Adobe\Acrobat\DC\JavaScripts"
$AcrobatTarget = Join-Path $AcrobatRoot "AdobeMCP.js"
if (Test-Path -LiteralPath $AcrobatSource) {
    Write-Host ""
    Write-Host "Installing Acrobat Adobe MCP folder-level script..."
    New-Item -ItemType Directory -Path $AcrobatRoot -Force | Out-Null
    Copy-Item -LiteralPath $AcrobatSource -Destination $AcrobatTarget -Force
    Write-Host "  $AcrobatTarget"
}

$SubstanceSource = Join-Path $RepoRoot "adapters\substance-3d-painter\python\startup\adobe_mcp.py"
$Documents = [Environment]::GetFolderPath("MyDocuments")
$SubstanceRoot = Join-Path $Documents "Adobe\Adobe Substance 3D Painter\python\startup"
$SubstanceTarget = Join-Path $SubstanceRoot "adobe_mcp.py"
if (Test-Path -LiteralPath $SubstanceSource) {
    Write-Host ""
    Write-Host "Installing Substance 3D Painter Adobe MCP startup plugin..."
    New-Item -ItemType Directory -Path $SubstanceRoot -Force | Out-Null
    Copy-Item -LiteralPath $SubstanceSource -Destination $SubstanceTarget -Force
    Write-Host "  $SubstanceTarget"
}

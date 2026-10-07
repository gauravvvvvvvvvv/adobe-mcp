$ErrorActionPreference = "Stop"

$Root = Join-Path $env:CommonProgramFiles "Adobe\UXP\Developer"
$Settings = Join-Path $Root "settings.json"

Write-Host "Enabling Adobe UXP Developer Mode..."
New-Item -ItemType Directory -Path $Root -Force | Out-Null
'{"developer":true}' | Set-Content -LiteralPath $Settings -Encoding UTF8

Write-Host ""
Write-Host "UXP Developer Mode enabled at:"
Write-Host "  $Settings"
Write-Host ""
Write-Host "Open Adobe UXP Developer Tool, Add Plugin, and select:"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Write-Host "  $(Join-Path $RepoRoot 'adapters\photoshop-uxp\manifest.json')"
Write-Host ""
Write-Host "Adobe requires UXP Developer Tool for loading an unpackaged plugin and for producing a .ccx installer."

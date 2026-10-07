$ErrorActionPreference = "Stop"
$CepTarget = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.gaurav.adobe-mcp"

if (Test-Path -LiteralPath $CepTarget) {
    Remove-Item -LiteralPath $CepTarget -Recurse -Force
    Write-Host "Removed $CepTarget"
} else {
    Write-Host "Adobe MCP CEP bridge is not installed at $CepTarget"
}

Write-Host "CEP PlayerDebugMode values were left unchanged because other local extensions may rely on them."

$LightroomTarget = Join-Path $env:APPDATA "Adobe\Lightroom\Modules\AdobeMCP.lrplugin"
if (Test-Path -LiteralPath $LightroomTarget) {
    Remove-Item -LiteralPath $LightroomTarget -Recurse -Force
    Write-Host "Removed $LightroomTarget"
}
$AcrobatTarget = Join-Path $env:APPDATA "Adobe\Acrobat\DC\JavaScripts\AdobeMCP.js"
if (Test-Path -LiteralPath $AcrobatTarget) {
    Remove-Item -LiteralPath $AcrobatTarget -Force
    Write-Host "Removed $AcrobatTarget"
}

$Documents = [Environment]::GetFolderPath("MyDocuments")
$SubstanceTarget = Join-Path $Documents "Adobe\Adobe Substance 3D Painter\python\startup\adobe_mcp.py"
if (Test-Path -LiteralPath $SubstanceTarget) {
    Remove-Item -LiteralPath $SubstanceTarget -Force
    Write-Host "Removed $SubstanceTarget"
}

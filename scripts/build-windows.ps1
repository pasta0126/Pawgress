# Build Pawgress for Windows and copy installers to .\release\
# Run from the repo root: .\scripts\build-windows.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
$OutDir   = Join-Path $RepoRoot "release\windows"

Set-Location $RepoRoot

Write-Host "Building Pawgress for Windows..." -ForegroundColor Cyan

npm run tauri build

$BundleDir = Join-Path $RepoRoot "src-tauri\target\release\bundle"
$null = New-Item -ItemType Directory -Force $OutDir

# Copy NSIS installer (.exe) and MSI
Get-ChildItem "$BundleDir\nsis\*.exe", "$BundleDir\msi\*.msi" -ErrorAction SilentlyContinue |
  Copy-Item -Destination $OutDir -Force

Write-Host ""
Write-Host "Done. Installers in: $OutDir" -ForegroundColor Green
Get-ChildItem $OutDir | Format-Table Name, Length -AutoSize

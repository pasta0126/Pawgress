# Build Pawgress for Windows and copy installers to ~/pawgress_executables/windows/
# Run from the repo root: .\scripts\build-windows.ps1

$ErrorActionPreference = "Stop"
$RepoRoot  = Split-Path $PSScriptRoot -Parent
$OutDir    = Join-Path $HOME "pawgress_executables\windows"
$BundleDir = Join-Path $RepoRoot "src-tauri\target\release\bundle"

Set-Location $RepoRoot

# Read version from tauri.conf.json
$tauriConf = Get-Content (Join-Path $RepoRoot "src-tauri\tauri.conf.json") | ConvertFrom-Json
$version   = $tauriConf.version
Write-Host "Building Pawgress v$version for Windows..." -ForegroundColor Cyan

# Clean old bundle output so stale installers from previous versions never get copied
if (Test-Path $BundleDir) {
    Write-Host "Cleaning old bundle..." -ForegroundColor DarkGray
    Remove-Item "$BundleDir\nsis" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item "$BundleDir\msi"  -Recurse -Force -ErrorAction SilentlyContinue
}

# Build
npm run tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build FAILED (exit $LASTEXITCODE)" -ForegroundColor Red
    exit $LASTEXITCODE
}

# Collect artifacts
$artifacts = @(
    Get-ChildItem "$BundleDir\nsis\*.exe" -ErrorAction SilentlyContinue
    Get-ChildItem "$BundleDir\msi\*.msi"  -ErrorAction SilentlyContinue
)

if ($artifacts.Count -eq 0) {
    Write-Host "Build succeeded but no installer files found in $BundleDir" -ForegroundColor Yellow
    exit 1
}

$null = New-Item -ItemType Directory -Force $OutDir
$artifacts | Copy-Item -Destination $OutDir -Force

Write-Host ""
Write-Host "Done. Installers (v$version) in: $OutDir" -ForegroundColor Green
Get-ChildItem $OutDir | Format-Table Name, Length, LastWriteTime -AutoSize

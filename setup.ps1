#requires -Version 5.1
<#
.SYNOPSIS
    One-shot installer for WatchCore RTOS.

.DESCRIPTION
    Prepares a fresh Windows PC to build and run WatchCore RTOS:
      1. Checks for prerequisites (Git, Node.js/npm, Visual Studio C++ tools).
         Missing tools can be auto-installed with winget.
      2. Downloads the pinned FreeRTOS-Kernel (V10.5.1) if it is not present.
      3. Installs the backend and frontend npm dependencies.
      4. Builds the FreeRTOS C simulator (WatchCore_RTOS.exe).

    After this completes successfully, run start-all.bat to launch everything.

.PARAMETER NoInstall
    Only check prerequisites and report what is missing; never call winget.

.PARAMETER SkipBuild
    Download the kernel and install npm deps, but do not build the C simulator.

.PARAMETER Yes
    Assume "yes" for every winget install prompt (non-interactive).
#>
[CmdletBinding()]
param(
    [switch]$NoInstall,
    [switch]$SkipBuild,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$KernelTag = 'V10.5.1'
$KernelUrl = 'https://github.com/FreeRTOS/FreeRTOS-Kernel.git'

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "    [ok]  $msg" -ForegroundColor Green }
function Write-Warn2([string]$msg){ Write-Host "    [!]   $msg" -ForegroundColor Yellow }
function Write-Err([string]$msg)  { Write-Host "    [x]   $msg" -ForegroundColor Red }

function Test-Cmd([string]$name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

function Update-PathFromRegistry {
    # Pull in PATH changes made by winget without needing a new shell.
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = ($machine, $user | Where-Object { $_ }) -join ';'
}

function Confirm-Yes([string]$question) {
    if ($Yes) { return $true }
    $ans = Read-Host "$question [Y/n]"
    return ($ans -eq '' -or $ans -match '^(y|yes)$')
}

function Install-WithWinget([string]$displayName, [string]$wingetId) {
    if ($NoInstall) {
        Write-Err "$displayName is missing. Re-run without -NoInstall, or install it manually."
        return $false
    }
    if (-not (Test-Cmd 'winget')) {
        Write-Err "$displayName is missing and winget is unavailable."
        Write-Warn2 "Install winget (App Installer) from the Microsoft Store, or install $displayName manually, then re-run setup."
        return $false
    }
    if (-not (Confirm-Yes "    Install $displayName now via winget?")) {
        Write-Warn2 "Skipped installing $displayName."
        return $false
    }
    Write-Host "    Installing $displayName ($wingetId) ..." -ForegroundColor Gray
    winget install --id $wingetId --exact --silent --accept-package-agreements --accept-source-agreements
    Update-PathFromRegistry
    return $true
}

# ----------------------------------------------------------------------------
# 0. Banner
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  WatchCore RTOS - setup" -ForegroundColor Cyan
Write-Host "  Repo: $RepoRoot" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($env:OS -ne 'Windows_NT') {
    Write-Err "WatchCore RTOS uses the MSVC FreeRTOS Windows simulator port and only builds on Windows."
    exit 1
}

# ----------------------------------------------------------------------------
# 1. Prerequisites
# ----------------------------------------------------------------------------
Write-Step "Checking prerequisites"

# --- Git ---
if (Test-Cmd 'git') {
    Write-Ok "Git found ($((git --version)))"
} else {
    Write-Warn2 "Git not found."
    [void](Install-WithWinget 'Git' 'Git.Git')
    if (-not (Test-Cmd 'git')) {
        Write-Err "Git is required to download the FreeRTOS kernel. Install it from https://git-scm.com/download/win and re-run."
        exit 1
    }
}

# --- Node.js + npm ---
if ((Test-Cmd 'node') -and (Test-Cmd 'npm')) {
    Write-Ok "Node.js found ($((node --version))), npm ($((npm --version)))"
} else {
    Write-Warn2 "Node.js / npm not found."
    [void](Install-WithWinget 'Node.js LTS' 'OpenJS.NodeJS.LTS')
    if (-not (Test-Cmd 'node') -or -not (Test-Cmd 'npm')) {
        Write-Err "Node.js 20+ is required. Install it from https://nodejs.org/ and re-run."
        exit 1
    }
}

# --- Visual Studio C++ build tools (needed by build.bat) ---
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vsFound = $false
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsPath) { $vsFound = $true; Write-Ok "Visual Studio C++ tools found ($vsPath)" }
}
if (-not $vsFound) {
    Write-Warn2 "Visual Studio with the 'Desktop development with C++' workload was not found."
    Write-Warn2 "This provides cl.exe, CMake, and Ninja used to build WatchCore_RTOS.exe."
    if (-not $NoInstall -and (Test-Cmd 'winget')) {
        Write-Warn2 "winget can install the VS 2022 Build Tools, but it is a large (~2-6 GB) download and"
        Write-Warn2 "you must add the 'Desktop development with C++' workload in the installer."
        if (Confirm-Yes "    Launch the VS 2022 Build Tools installer via winget now?") {
            winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-package-agreements --accept-source-agreements --override "--passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
            Update-PathFromRegistry
        }
    } else {
        Write-Warn2 "Download Visual Studio Community (free): https://visualstudio.microsoft.com/downloads/"
        Write-Warn2 "and select the 'Desktop development with C++' workload."
    }
}

# ----------------------------------------------------------------------------
# 2. FreeRTOS kernel (pinned)
# ----------------------------------------------------------------------------
Write-Step "FreeRTOS kernel ($KernelTag)"
$kernelDir = Join-Path $RepoRoot 'FreeRTOS-Kernel'
if (Test-Path (Join-Path $kernelDir 'tasks.c')) {
    Write-Ok "Kernel already present at FreeRTOS-Kernel/"
} else {
    if (Test-Path $kernelDir) {
        Write-Warn2 "FreeRTOS-Kernel/ exists but looks incomplete; removing and re-cloning."
        Remove-Item -Recurse -Force $kernelDir
    }
    Write-Host "    Cloning $KernelUrl @ $KernelTag (shallow) ..." -ForegroundColor Gray
    git clone --depth 1 --branch $KernelTag $KernelUrl $kernelDir
    if (-not (Test-Path (Join-Path $kernelDir 'tasks.c'))) {
        Write-Err "Failed to download the FreeRTOS kernel. Check your internet connection and re-run."
        exit 1
    }
    Write-Ok "Kernel downloaded."
}

# ----------------------------------------------------------------------------
# 3. npm dependencies
# ----------------------------------------------------------------------------
function Install-NpmDeps([string]$relPath) {
    $dir = Join-Path $RepoRoot $relPath
    if (Test-Path (Join-Path $dir 'node_modules')) {
        Write-Ok "$relPath dependencies already installed."
        return
    }
    Write-Host "    Installing $relPath dependencies ..." -ForegroundColor Gray
    Push-Location $dir
    try {
        npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm install failed in $relPath" }
        Write-Ok "$relPath dependencies installed."
    } finally {
        Pop-Location
    }
}

Write-Step "Installing web dependencies"
Install-NpmDeps 'web\backend'
Install-NpmDeps 'web\frontend'

# ----------------------------------------------------------------------------
# 4. Build the C simulator
# ----------------------------------------------------------------------------
if ($SkipBuild) {
    Write-Step "Skipping C build (-SkipBuild)"
} elseif (-not $vsFound) {
    Write-Step "Skipping C build"
    Write-Warn2 "Visual Studio C++ tools are not installed yet, so WatchCore_RTOS.exe was not built."
    Write-Warn2 "Install them, then run:  build.bat x64-debug"
} else {
    Write-Step "Building FreeRTOS C simulator"
    & "$RepoRoot\build.bat" x64-debug
    if ($LASTEXITCODE -ne 0) {
        Write-Err "build.bat failed. See the output above."
        exit 1
    }
    $exe = Join-Path $RepoRoot 'out\build\x64-debug\WatchCore_RTOS.exe'
    if (Test-Path $exe) { Write-Ok "Built $exe" }
}

# ----------------------------------------------------------------------------
# Done
# ----------------------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Setup complete." -ForegroundColor Green
Write-Host "  Next step:  start-all.bat   (builds if needed, then launches the full stack)" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
exit 0

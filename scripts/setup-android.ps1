<#
.SYNOPSIS
  Automated installer for Android dev tools needed to build SLAVE VPN APK.

.DESCRIPTION
  Installs JDK 17 (via winget if available, else manual download) + Android
  command line tools + base SDK packages (platform-tools, android-34,
  build-tools 34). Sets env vars at User scope.

  Does NOT install full Android Studio (saves ~3 GB).

  Run from PowerShell with administrator privileges.

.NOTES
  After this script: close + reopen terminal to pick up new PATH.
  Then verify with:  sdkmanager --version  AND  adb version
#>

[CmdletBinding()]
param(
  [string]$AndroidHome = "C:\Android",
  [switch]$SkipJdk,
  [switch]$SkipSdk
)

$ErrorActionPreference = "Stop"

function Info($msg)    { Write-Host "[setup-android] $msg" -ForegroundColor Cyan }
function Warn($msg)    { Write-Host "[setup-android] $msg" -ForegroundColor Yellow }
function Failed($msg)  { Write-Host "[setup-android] ERROR: $msg" -ForegroundColor Red; exit 1 }
function Success($msg) { Write-Host "[setup-android] $msg" -ForegroundColor Green }

# ─── Admin check ──────────────────────────────────────────────────────────────

$isAdmin = ([Security.Principal.WindowsPrincipal] `
            [Security.Principal.WindowsIdentity]::GetCurrent() `
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Failed "Run this script from an elevated PowerShell (Run as administrator)."
}

# ─── JDK 17 ───────────────────────────────────────────────────────────────────

if (-not $SkipJdk) {
  Info "Checking JDK 17..."
  $javaCmd = Get-Command java -ErrorAction SilentlyContinue
  $needsJdk = $true
  if ($javaCmd) {
    try {
      $ver = & java -version 2>&1 | Select-Object -First 1
      if ($ver -match 'version "17') {
        Success "JDK 17 already installed: $ver"
        $needsJdk = $false
      }
    } catch { }
  }

  if ($needsJdk) {
    Info "Installing JDK 17 via winget..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
      winget install --silent --accept-source-agreements --accept-package-agreements EclipseAdoptium.Temurin.17.JDK
      if ($LASTEXITCODE -ne 0) {
        Warn "winget exited $LASTEXITCODE. Continuing — may already be installed."
      }
    } else {
      Failed @"
winget not available. Install JDK 17 manually:
  https://adoptium.net/temurin/releases/?version=17&package=jdk&os=windows&arch=x64
After install, rerun this script.
"@
    }
  }
}

# ─── Android command line tools ───────────────────────────────────────────────

if (-not $SkipSdk) {
  Info "Setting up Android command line tools at $AndroidHome..."

  $cmdLineToolsDir = Join-Path $AndroidHome "cmdline-tools\latest"
  $sdkManager = Join-Path $cmdLineToolsDir "bin\sdkmanager.bat"

  if (Test-Path $sdkManager) {
    Success "cmdline-tools already present at $cmdLineToolsDir"
  } else {
    Info "Downloading commandlinetools-win-11076708_latest.zip..."
    $zipUrl  = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
    $zipPath = Join-Path $env:TEMP "cmdline-tools.zip"

    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Info "Extracting..."
    New-Item -Path (Join-Path $AndroidHome "cmdline-tools") -ItemType Directory -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath (Join-Path $AndroidHome "cmdline-tools") -Force

    # Zip extracts into cmdline-tools/, but sdkmanager requires .../cmdline-tools/latest/
    $extracted = Join-Path $AndroidHome "cmdline-tools\cmdline-tools"
    if (Test-Path $extracted) {
      if (Test-Path $cmdLineToolsDir) { Remove-Item -Recurse -Force $cmdLineToolsDir }
      Rename-Item -Path $extracted -NewName "latest"
    }

    Remove-Item $zipPath -Force
    Success "cmdline-tools installed."
  }

  # ─── Env vars ───────────────────────────────────────────────────────────────

  Info "Setting ANDROID_HOME + ANDROID_SDK_ROOT + PATH..."
  [Environment]::SetEnvironmentVariable("ANDROID_HOME",     $AndroidHome, "User")
  [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $AndroidHome, "User")

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $addPaths = @(
    "$AndroidHome\cmdline-tools\latest\bin",
    "$AndroidHome\platform-tools"
  )
  foreach ($p in $addPaths) {
    if ($userPath -notlike "*$p*") {
      $userPath = "$userPath;$p"
      Info "  + $p"
    }
  }
  [Environment]::SetEnvironmentVariable("Path", $userPath, "User")

  # Refresh current process env so subsequent calls work immediately
  $env:ANDROID_HOME = $AndroidHome
  $env:ANDROID_SDK_ROOT = $AndroidHome
  $env:Path = "$env:Path;$AndroidHome\cmdline-tools\latest\bin;$AndroidHome\platform-tools"

  # ─── SDK packages ───────────────────────────────────────────────────────────

  Info "Accepting licenses..."
  & "$AndroidHome\cmdline-tools\latest\bin\sdkmanager.bat" --licenses | Out-Null

  Info "Installing platform-tools + android-34 + build-tools 34..."
  & "$AndroidHome\cmdline-tools\latest\bin\sdkmanager.bat" `
    "platform-tools" "platforms;android-34" "build-tools;34.0.0"
  if ($LASTEXITCODE -ne 0) {
    Failed "sdkmanager install failed with exit $LASTEXITCODE"
  }

  Success "SDK packages installed."
}

# ─── Verification ─────────────────────────────────────────────────────────────

Write-Host ""
Info "Verification:"
try {
  $java = & java -version 2>&1 | Select-Object -First 1
  Write-Host "  java:    $java"
} catch { Warn "java not on PATH — open a new terminal" }

$sdk = "$AndroidHome\cmdline-tools\latest\bin\sdkmanager.bat"
if (Test-Path $sdk) {
  $sdkVer = & $sdk --version 2>&1 | Select-Object -First 1
  Write-Host "  sdkmanager: $sdkVer"
}

$adb = "$AndroidHome\platform-tools\adb.exe"
if (Test-Path $adb) {
  $adbVer = & $adb version 2>&1 | Select-Object -First 1
  Write-Host "  adb:     $adbVer"
}

Write-Host ""
Success "Done. Close + reopen your terminal so PATH refreshes, then return"
Success "to the chat and say 'SDK готов'."

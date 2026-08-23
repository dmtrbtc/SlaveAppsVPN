#requires -Version 7.2

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $MihomoSource,

  [string] $OutputPath,
  [string] $GoRoot,
  [string] $GoPath,
  [string] $GomobileBin,
  [string] $JavaHome,
  [string] $AndroidHome,
  [string] $AndroidNdkHome
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

# Keep these pins aligned with scripts/engine-manifest.mjs and the AAR metadata
# in apps/android/libs/README.md.
$ExpectedTag = 'v1.19.30'
$ExpectedCommit = 'ac017cdd246ce8bd547653d927e7bf77d7ee73d5'
$MobileVersion = 'v0.0.0-20260529142300-ecb4cd65260a'
$MobileGraphVersion = 'v0.0.0-20190312151609-d3739f865fa6'
$GoToolchain = 'go1.26.6+auto'
$BuildTime = '2026-08-16T10:11:00Z'
$ExpectedAarSha256 = '2ec9ee3ad6632f7bf4d6f1d9644b18fbd75b0bfad19db20e10fd35ca7308a334'

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$WrapperSource = Join-Path $PSScriptRoot 'clashbox.go'

if (-not $OutputPath) { $OutputPath = Join-Path $RepoRoot 'apps\android\libs\clashbox.aar' }
if (-not $GoRoot) { $GoRoot = if ($env:SLAVE_GO_ROOT) { $env:SLAVE_GO_ROOT } else { 'E:\dev\go' } }
if (-not $GoPath) { $GoPath = if ($env:SLAVE_GO_PATH) { $env:SLAVE_GO_PATH } else { 'E:\dev\gopath' } }
if (-not $GomobileBin) { $GomobileBin = if ($env:SLAVE_GOMOBILE_BIN) { $env:SLAVE_GOMOBILE_BIN } else { 'E:\dev\gomobile-std\bin' } }
if (-not $JavaHome) { $JavaHome = if ($env:SLAVE_JAVA_HOME) { $env:SLAVE_JAVA_HOME } else { 'E:\dev\jdk\jdk-21.0.11+10' } }
if (-not $AndroidHome) { $AndroidHome = if ($env:SLAVE_ANDROID_HOME) { $env:SLAVE_ANDROID_HOME } else { 'E:\dev\Android' } }
if (-not $AndroidNdkHome) { $AndroidNdkHome = if ($env:SLAVE_ANDROID_NDK_HOME) { $env:SLAVE_ANDROID_NDK_HOME } else { Join-Path $AndroidHome 'ndk\26.1.10909125' } }

$InputSourcePath = (Resolve-Path -LiteralPath $MihomoSource).Path
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
$GoExe = Join-Path $GoRoot 'bin\go.exe'
$GomobileExe = Join-Path $GomobileBin 'gomobile.exe'
$GobindExe = Join-Path $GomobileBin 'gobind.exe'
$JavaExe = Join-Path $JavaHome 'bin\java.exe'
$JavapExe = Join-Path $JavaHome 'bin\javap.exe'

foreach ($RequiredPath in @(
  (Join-Path $InputSourcePath '.git'),
  $WrapperSource,
  $GoExe,
  $GomobileExe,
  $GobindExe,
  $JavaExe,
  $JavapExe,
  $AndroidNdkHome
)) {
  if (-not (Test-Path -LiteralPath $RequiredPath)) {
    throw "Required build input is missing: $RequiredPath"
  }
}

$ExpectedMobileModule = "mod`tgolang.org/x/mobile`t$MobileVersion"
$GomobileInfo = (& $GoExe version -m $GomobileExe) -join "`n"
$GobindInfo = (& $GoExe version -m $GobindExe) -join "`n"
if ($GomobileInfo -notlike "*$ExpectedMobileModule*" -or $GobindInfo -notlike "*$ExpectedMobileModule*") {
  throw "gomobile and gobind must both be built from golang.org/x/mobile $MobileVersion"
}

$Head = (& git -C $InputSourcePath rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $Head -ne $ExpectedCommit) {
  throw "Expected Mihomo $ExpectedTag at $ExpectedCommit, got $Head"
}
$Tag = (& git -C $InputSourcePath describe --tags --exact-match).Trim()
if ($LASTEXITCODE -ne 0 -or $Tag -ne $ExpectedTag) {
  throw "Mihomo checkout is not the exact $ExpectedTag tag (got '$Tag')"
}
$Dirty = (& git -C $InputSourcePath status --porcelain)
if ($LASTEXITCODE -ne 0 -or $Dirty) {
  throw 'Mihomo checkout must be clean before the reproducible build'
}

$env:GOROOT = $GoRoot
$env:GOPATH = $GoPath
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_NDK_HOME = $AndroidNdkHome
$env:ANDROID_NDK_ROOT = $AndroidNdkHome
$env:GOBIN = $GomobileBin
$env:GOTOOLCHAIN = $GoToolchain
$env:SOURCE_DATE_EPOCH = '1786875060'
$env:Path = "$(Join-Path $GoRoot 'bin');$GomobileBin;$(Join-Path $JavaHome 'bin');$env:Path"

$SelectedGoVersion = (& $GoExe version) -join "`n"
if ($SelectedGoVersion -notmatch '\bgo1\.26\.6\b') {
  throw "Expected Go 1.26.6 toolchain, got '$SelectedGoVersion'"
}

function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory = $true)]
    [string] $FilePath,
    [Parameter(Mandatory = $true)]
    [string[]] $Arguments,
    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  $StartInfo = [Diagnostics.ProcessStartInfo]::new()
  $StartInfo.FileName = $FilePath
  $StartInfo.UseShellExecute = $false
  $StartInfo.WorkingDirectory = $SourcePath
  foreach ($Argument in $Arguments) { [void] $StartInfo.ArgumentList.Add($Argument) }

  $Process = [Diagnostics.Process]::Start($StartInfo)
  $Process.WaitForExit()
  if ($Process.ExitCode -ne 0) { throw "$Label failed with exit code $($Process.ExitCode)" }
}

$StageRoot = Join-Path ([IO.Path]::GetTempPath()) "slave-clashbox-$([Guid]::NewGuid().ToString('N'))"
$SourcePath = Join-Path ([IO.Path]::GetTempPath()) "slave-clashbox-source-$ExpectedCommit"
$SourceArchive = Join-Path $StageRoot 'mihomo-source.tar'
$StageAar = Join-Path $StageRoot 'clashbox.aar'
$InspectDir = Join-Path $StageRoot 'inspect'
New-Item -ItemType Directory -Path $InspectDir -Force | Out-Null

$StartedAt = Get-Date
try {
  # Go module metadata records local replacement paths even with -trimpath.
  # Exporting the validated commit to a stable path keeps the native binaries
  # byte-for-byte reproducible and avoids modifying the caller's checkout.
  if (Test-Path -LiteralPath $SourcePath) {
    Remove-Item -LiteralPath $SourcePath -Recurse -Force
  }
  New-Item -ItemType Directory -Path $SourcePath -Force | Out-Null
  & git -C $InputSourcePath archive '--format=tar' "--output=$SourceArchive" HEAD
  if ($LASTEXITCODE -ne 0) { throw "git archive failed with exit code $LASTEXITCODE" }
  & tar -xf $SourceArchive -C $SourcePath
  if ($LASTEXITCODE -ne 0) { throw "source extraction failed with exit code $LASTEXITCODE" }

  $WrapperDir = Join-Path $SourcePath 'clashbox'
  New-Item -ItemType Directory -Path $WrapperDir -Force | Out-Null
  Copy-Item -LiteralPath $WrapperSource -Destination (Join-Path $WrapperDir 'clashbox.go') -Force

  Push-Location $SourcePath
  try {
    # Go 1.26 gomobile checks that x/mobile/bind is resolvable from the source
    # module. A pre-module x/mobile revision satisfies that probe without
    # raising Mihomo's x/crypto, x/net and x/sys runtime dependency versions.
    & $GoExe mod edit "-require=golang.org/x/mobile@$MobileGraphVersion"
    if ($LASTEXITCODE -ne 0) { throw "go mod edit failed with exit code $LASTEXITCODE" }
    & $GoExe mod download "golang.org/x/mobile@$MobileGraphVersion"
    if ($LASTEXITCODE -ne 0) { throw "go mod download x/mobile failed with exit code $LASTEXITCODE" }

    $LdFlags = "-X github.com/metacubex/mihomo/constant.Version=$ExpectedTag -X github.com/metacubex/mihomo/constant.BuildTime=$BuildTime -s -w -buildid="
    Invoke-NativeChecked -FilePath $GomobileExe -Label 'gomobile bind' -Arguments @(
      'bind',
      '-v',
      '-target=android/arm64,android/arm',
      '-androidapi=21',
      '-javapkg=com.slavevpn.clash',
      '-tags=cmfa,with_gvisor',
      '-trimpath',
      '-ldflags',
      $LdFlags,
      '-o',
      $StageAar,
      './clashbox'
    )
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $StageAar)) { throw 'gomobile completed without producing an AAR' }

  $Entries = @(& tar -tf $StageAar)
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the generated AAR' }
  foreach ($RequiredEntry in @(
    'classes.jar',
    'jni/arm64-v8a/libgojni.so',
    'jni/armeabi-v7a/libgojni.so'
  )) {
    if ($Entries -notcontains $RequiredEntry) { throw "Generated AAR is missing $RequiredEntry" }
  }

  & tar -xf $StageAar -C $InspectDir classes.jar
  if ($LASTEXITCODE -ne 0) { throw 'Unable to extract classes.jar from the generated AAR' }
  $Api = (& $JavapExe -classpath (Join-Path $InspectDir 'classes.jar') `
      com.slavevpn.clash.clashbox.Clashbox `
      com.slavevpn.clash.clashbox.Protector `
      com.slavevpn.clash.clashbox.LogHandler) -join "`n"
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect the generated Clashbox Java API' }
  foreach ($RequiredSignature in @(
    'public static native void closeAllConnections();',
    'public static native boolean closeConnection(java.lang.String);',
    'public static native java.lang.String currentProxy(java.lang.String);',
    'public static native java.lang.String getConnections();',
    'public static native java.lang.String getRuleProviders();',
    'public static native java.lang.String getTraffic();',
    'public static native void selectProxy(java.lang.String, java.lang.String) throws java.lang.Exception;',
    'public static native void setProtector(com.slavevpn.clash.clashbox.Protector);',
    'public static native void setup(java.lang.String);',
    'public static native void start(java.lang.String) throws java.lang.Exception;',
    'public static native void startLogForward(com.slavevpn.clash.clashbox.LogHandler);',
    'public static native void stop();',
    'public static native void stopLogForward();',
    'public static native long testDelay(java.lang.String, java.lang.String, long);',
    'public static native java.lang.String updateRuleProviders();',
    'public static native java.lang.String version();',
    'public abstract boolean protect(long);',
    'public abstract void log(java.lang.String, java.lang.String);'
  )) {
    if (-not $Api.Contains($RequiredSignature, [StringComparison]::Ordinal)) {
      throw "Generated Java API is missing signature: $RequiredSignature"
    }
  }

  $Sha256 = (Get-FileHash -LiteralPath $StageAar -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($Sha256 -ne $ExpectedAarSha256) {
    throw "Generated AAR SHA-256 mismatch: expected $ExpectedAarSha256, got $Sha256"
  }

  $OutputDir = Split-Path -Parent $OutputPath
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  Copy-Item -LiteralPath $StageAar -Destination $OutputPath -Force
  $Artifact = Get-Item -LiteralPath $OutputPath
  Write-Host 'clashbox AAR built and verified'
  Write-Host "  source:  $ExpectedTag ($ExpectedCommit)"
  Write-Host "  output:  $OutputPath"
  Write-Host "  size:    $([math]::Round($Artifact.Length / 1MB, 2)) MB"
  Write-Host "  sha256:  $Sha256"
  Write-Host "  elapsed: $([int]((Get-Date) - $StartedAt).TotalSeconds)s"
} finally {
  if (Test-Path -LiteralPath $SourcePath) {
    Remove-Item -LiteralPath $SourcePath -Recurse -Force
  }
  if (Test-Path -LiteralPath $StageRoot) {
    Remove-Item -LiteralPath $StageRoot -Recurse -Force
  }
}

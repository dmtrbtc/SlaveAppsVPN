#requires -Version 7.2

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $MihomoSource,

  [string] $OutputPath,

  [switch] $Candidate,
  [switch] $EmbeddedXray,
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
$MobileGraphVersion = $MobileVersion
$GoToolchain = 'go1.26.3+auto'
$XrayModule = 'v1.260327.1-0.20261109052709-676eaf66f8f0'
if ($EmbeddedXray) {
  if (-not $Candidate) { throw 'Use -Candidate when building the combined Android core' }
  $MobileVersion = 'v0.0.0-20261011034528-197770444867'
  $MobileGraphVersion = $MobileVersion
  $GoToolchain = 'go1.27.3+auto'
}
$BuildTime = '2026-08-16T10:11:00Z'
$ExpectedAarSha256 = '339b9580152c1a3fb8ed492e09ad99521cbe8219bb1a39882a4239d2996ac05d'

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$WrapperSource = Join-Path $PSScriptRoot 'clashbox.go'
$PatchRoot = Join-Path $RepoRoot 'patches\mihomo'

if (-not $OutputPath) { $OutputPath = Join-Path $RepoRoot 'apps\android\libs\clashbox.aar' }
$TrackedAar = Join-Path $RepoRoot 'apps\android\libs\clashbox.aar'
if (-not $GoRoot) { $GoRoot = if ($env:SLAVE_GO_ROOT) { $env:SLAVE_GO_ROOT } else { 'E:\dev\go' } }
if (-not $GoPath) { $GoPath = if ($env:SLAVE_GO_PATH) { $env:SLAVE_GO_PATH } else { 'E:\dev\gopath' } }
if (-not $GomobileBin) { $GomobileBin = if ($env:SLAVE_GOMOBILE_BIN) { $env:SLAVE_GOMOBILE_BIN } else { 'E:\dev\gomobile-std\bin' } }
if (-not $JavaHome) { $JavaHome = if ($env:SLAVE_JAVA_HOME) { $env:SLAVE_JAVA_HOME } else { 'E:\dev\jdk\jdk-21.0.11+10' } }
if (-not $AndroidHome) { $AndroidHome = if ($env:SLAVE_ANDROID_HOME) { $env:SLAVE_ANDROID_HOME } else { 'E:\dev\Android' } }
if (-not $AndroidNdkHome) { $AndroidNdkHome = if ($env:SLAVE_ANDROID_NDK_HOME) { $env:SLAVE_ANDROID_NDK_HOME } else { Join-Path $AndroidHome 'ndk\26.1.10909125' } }

$InputSourcePath = (Resolve-Path -LiteralPath $MihomoSource).Path
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if ($Candidate -and $OutputPath -eq $TrackedAar) {
  throw 'Specify a separate OutputPath when building a candidate AAR'
}
$GoExe = Join-Path $GoRoot 'bin\go.exe'
$GomobileExe = Join-Path $GomobileBin 'gomobile.exe'
$GobindExe = Join-Path $GomobileBin 'gobind.exe'
$JavaExe = Join-Path $JavaHome 'bin\java.exe'
$JavapExe = Join-Path $JavaHome 'bin\javap.exe'

foreach ($RequiredPath in @(
  (Join-Path $InputSourcePath '.git'),
  $WrapperSource,
  (Join-Path $PatchRoot '0001-modern-reality-client.patch'),
  (Join-Path $PatchRoot '0002-modern-reality-tests.patch'),
  (Join-Path $PatchRoot '0003-modern-reality-dependency.patch'),
  (Join-Path $PatchRoot '0004-reality-clienthello-fragmentation.patch'),
  (Join-Path $PatchRoot '0005-android-nat64-dial.patch'),
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
if ($SelectedGoVersion -notmatch ('\b' + [regex]::Escape($GoToolchain.Split('+')[0]) + '\b')) {
  throw "Expected $GoToolchain, got '$SelectedGoVersion'"
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
  foreach ($Name in @('PATH', 'GOROOT', 'GOPATH', 'GOBIN', 'GOTOOLCHAIN', 'GOCACHE', 'GOMODCACHE', 'GOPROXY', 'GOSUMDB', 'JAVA_HOME', 'ANDROID_HOME', 'ANDROID_NDK_HOME', 'ANDROID_NDK_ROOT', 'SOURCE_DATE_EPOCH')) {
    $Value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ($null -ne $Value) { $StartInfo.Environment[$Name] = $Value }
  }
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

  foreach ($PatchName in @('0001-modern-reality-client.patch', '0002-modern-reality-tests.patch', '0003-modern-reality-dependency.patch', '0004-reality-clienthello-fragmentation.patch', '0005-android-nat64-dial.patch')) {
    & git -C $SourcePath apply '--whitespace=error-all' (Join-Path $PatchRoot $PatchName)
    if ($LASTEXITCODE -ne 0) { throw "Unable to apply owned Mihomo patch: $PatchName" }
  }

  $WrapperDir = Join-Path $SourcePath 'clashbox'
  New-Item -ItemType Directory -Path $WrapperDir -Force | Out-Null
  Copy-Item -LiteralPath $WrapperSource -Destination $WrapperDir -Force
  $XrayWrapper = if ($EmbeddedXray) { 'xray.go' } else { 'xray_disabled.go' }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $XrayWrapper) -Destination $WrapperDir -Force

  Push-Location $SourcePath
  try {
    $Tags = 'cmfa,with_gvisor'
    $VersionSuffix = '-slave.4'
    $ExtraLinkFlags = ''
    if ($EmbeddedXray) {
      & $GoExe get "github.com/xtls/xray-core@$XrayModule" "golang.org/x/mobile@$MobileGraphVersion"
      if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve Android Xray dependencies' }
      & $GoExe mod edit '-dropreplace=google.golang.org/protobuf'
      if ($LASTEXITCODE -ne 0) { throw 'Unable to select shared protobuf dependency' }
      $Tags += ',xray'
      $VersionSuffix = '-slave.5-xray'
      $ExtraLinkFlags = '-checklinkname=0 -extldflags=-Wl,-z,max-page-size=16384 '
    }
    # gomobile requires the matching x/mobile/bind package to be present in the
    # source module. Pin it to the exact revision used to build gomobile/gobind.
    & $GoExe get '-tool' "golang.org/x/mobile/cmd/gobind@$MobileGraphVersion"
    if ($LASTEXITCODE -ne 0) { throw "go get x/mobile gobind tool failed with exit code $LASTEXITCODE" }

    $LdFlags = "${ExtraLinkFlags}-X github.com/metacubex/mihomo/constant.Version=$ExpectedTag$VersionSuffix -X github.com/metacubex/mihomo/constant.BuildTime=$BuildTime -s -w -buildid="
    Invoke-NativeChecked -FilePath $GomobileExe -Label 'gomobile bind' -Arguments @(
      'bind',
      '-v',
      '-target=android/arm64,android/arm',
      '-androidapi=21',
      '-javapkg=com.slavevpn.clash',
      "-tags=$Tags",
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
    'public static native void setNAT64Prefix(java.lang.String);',
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
  if (-not $Candidate -and $Sha256 -ne $ExpectedAarSha256) {
    throw "Generated AAR SHA-256 mismatch: expected $ExpectedAarSha256, got $Sha256"
  }

  $OutputDir = Split-Path -Parent $OutputPath
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  Copy-Item -LiteralPath $StageAar -Destination $OutputPath -Force
  $Artifact = Get-Item -LiteralPath $OutputPath
  Write-Host 'clashbox AAR built and verified'
  Write-Host "  source:  $ExpectedTag ($ExpectedCommit)"
  Write-Host "  patches: REALITY 26.11.9, ClientHello fragmentation, Android NAT64"
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

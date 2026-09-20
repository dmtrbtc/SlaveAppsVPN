#requires -Version 7.2

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $MihomoSource,

  [string] $OutputPath = 'apps/windows/resources/bin/mihomo.exe',
  [string] $GoExe = 'go'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$ExpectedTag = 'v1.19.30'
$ExpectedCommit = 'ac017cdd246ce8bd547653d927e7bf77d7ee73d5'
$BuildTime = '2026-08-16T10:11:00Z'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$PatchRoot = Join-Path $RepoRoot 'patches\mihomo'
$InputSourcePath = (Resolve-Path -LiteralPath $MihomoSource).Path
$OutputPath = [IO.Path]::GetFullPath((Join-Path $RepoRoot $OutputPath))

$head = (& git -C $InputSourcePath rev-parse HEAD).Trim()
$tag = (& git -C $InputSourcePath describe --tags --exact-match).Trim()
$dirty = & git -C $InputSourcePath status --porcelain
if ($head -ne $ExpectedCommit -or $tag -ne $ExpectedTag -or $dirty) {
  throw "Expected a clean Mihomo $ExpectedTag checkout at $ExpectedCommit"
}

$stageRoot = Join-Path ([IO.Path]::GetTempPath()) "slave-mihomo-windows-$([Guid]::NewGuid().ToString('N'))"
$sourcePath = Join-Path $stageRoot 'source'
$sourceArchive = Join-Path $stageRoot 'source.tar'
try {
  New-Item -ItemType Directory -Path $sourcePath -Force | Out-Null
  & git -C $InputSourcePath archive '--format=tar' "--output=$sourceArchive" HEAD
  if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }
  & tar -xf $sourceArchive -C $sourcePath
  if ($LASTEXITCODE -ne 0) { throw 'source extraction failed' }

  foreach ($patchName in @('0001-modern-reality-client.patch', '0002-modern-reality-tests.patch', '0003-modern-reality-dependency.patch', '0004-reality-clienthello-fragmentation.patch')) {
    & git -C $sourcePath apply '--whitespace=error-all' (Join-Path $PatchRoot $patchName)
    if ($LASTEXITCODE -ne 0) { throw "Unable to apply owned Mihomo patch: $patchName" }
  }

  Push-Location $sourcePath
  try {
    & $GoExe test './component/tls' './adapter/outbound'
    if ($LASTEXITCODE -ne 0) { throw 'Patched Mihomo tests failed' }

    $ldflags = "-X github.com/metacubex/mihomo/constant.Version=$ExpectedTag-slave.1 -X github.com/metacubex/mihomo/constant.BuildTime=$BuildTime -s -w -buildid="
    $env:CGO_ENABLED = '0'
    $outputDir = Split-Path -Parent $OutputPath
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    & $GoExe build '-tags=with_gvisor' '-trimpath' '-ldflags' $ldflags '-o' $OutputPath '.'
    if ($LASTEXITCODE -ne 0) { throw 'Patched Mihomo Windows build failed' }
  } finally {
    Pop-Location
  }

  & $OutputPath '-v'
  if ($LASTEXITCODE -ne 0) { throw 'Built Mihomo executable did not start' }
  $sha256 = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "Patched Mihomo Windows core built: $OutputPath"
  Write-Host "SHA-256: $sha256"
} finally {
  if (Test-Path -LiteralPath $stageRoot) {
    $resolved = [IO.Path]::GetFullPath($stageRoot)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved).StartsWith('slave-mihomo-windows-')) {
      Remove-Item -LiteralPath $resolved -Recurse -Force
    }
  }
}

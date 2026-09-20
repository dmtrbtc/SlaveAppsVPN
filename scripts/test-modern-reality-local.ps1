#requires -Version 7.2

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $XrayExe,

  [string] $MihomoExe = 'apps/windows/resources/bin/mihomo.exe',

  [switch] $FragmentClientHello,

  [switch] $Mldsa65,

  [string] $MinClientVersion = '26.9.9',

  [switch] $KeepArtifacts
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$XrayExe = (Resolve-Path -LiteralPath $XrayExe).Path
$MihomoExe = (Resolve-Path -LiteralPath (Join-Path $RepoRoot $MihomoExe)).Path
$TempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$TestRoot = Join-Path $TempRoot "slave-modern-reality-$([Guid]::NewGuid().ToString('N'))"
$TestRoot = [IO.Path]::GetFullPath($TestRoot)
if (-not $TestRoot.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Unsafe temporary path'
}

function Read-GeneratedValue {
  param(
    [Parameter(Mandatory = $true)]
    [string[]] $Lines,
    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  $Match = $Lines | Select-String -Pattern "^$([regex]::Escape($Label)):\s*(\S+)\s*$" | Select-Object -First 1
  if (-not $Match) { throw "Unable to read generated $Label" }
  return $Match.Matches[0].Groups[1].Value
}

function Stop-TestProcess {
  param([Diagnostics.Process] $Process)
  if ($null -ne $Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    $Process.WaitForExit(5000) | Out-Null
  }
}

New-Item -ItemType Directory -Path $TestRoot | Out-Null
$XrayProcess = $null
$MihomoProcess = $null
$TargetProcess = $null
try {
  $X25519 = @(& $XrayExe x25519)
  if ($LASTEXITCODE -ne 0) { throw 'Xray x25519 generation failed' }
  $PrivateKey = Read-GeneratedValue -Lines $X25519 -Label 'PrivateKey'
  $PublicKey = Read-GeneratedValue -Lines $X25519 -Label 'Password (PublicKey)'

  $MldsaSeed = $null
  $MldsaVerify = $null
  if ($Mldsa65) {
    $Mldsa = @(& $XrayExe mldsa65)
    if ($LASTEXITCODE -ne 0) { throw 'Xray mldsa65 generation failed' }
    $MldsaSeed = Read-GeneratedValue -Lines $Mldsa -Label 'Seed'
    $MldsaVerify = Read-GeneratedValue -Lines $Mldsa -Label 'Verify'
  }

  $Uuid = (& $XrayExe uuid).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $Uuid) { throw 'Xray UUID generation failed' }
  $ShortId = '6ba85179e30d4fc2'
  $ServerName = 'localhost'

  $TargetKey = [Security.Cryptography.RSA]::Create(2048)
  $TargetRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
    "CN=$ServerName",
    $TargetKey,
    [Security.Cryptography.HashAlgorithmName]::SHA256,
    [Security.Cryptography.RSASignaturePadding]::Pkcs1
  )
  $TargetRequest.CertificateExtensions.Add(
    [Security.Cryptography.X509Certificates.X509Extension]::new(
      [Security.Cryptography.Oid]::new('1.3.6.1.4.1.55555.1'),
      [byte[]]::new(4096),
      $false
    )
  )
  $TargetCertificate = $TargetRequest.CreateSelfSigned((Get-Date).AddMinutes(-5), (Get-Date).AddDays(1))
  ([Security.Cryptography.PemEncoding]::Write('CERTIFICATE', $TargetCertificate.RawData) -join '') |
    Set-Content -LiteralPath (Join-Path $TestRoot 'target.crt') -Encoding ascii
  ([Security.Cryptography.PemEncoding]::Write('PRIVATE KEY', $TargetKey.ExportPkcs8PrivateKey()) -join '') |
    Set-Content -LiteralPath (Join-Path $TestRoot 'target.key') -Encoding ascii
  @'
const fs = require('fs')
const https = require('https')
https.createServer({
  cert: fs.readFileSync('target.crt'),
  key: fs.readFileSync('target.key'),
}, (_req, res) => {
  res.writeHead(204)
  res.end()
}).listen(19443, '127.0.0.1')
'@ | Set-Content -LiteralPath (Join-Path $TestRoot 'target.cjs') -Encoding utf8NoBOM

  $XrayConfig = [ordered]@{
    log = @{ loglevel = 'warning' }
    inbounds = @(
      [ordered]@{
        listen = '127.0.0.1'
        port = 18443
        protocol = 'vless'
        settings = @{
          clients = @(@{ id = $Uuid; flow = 'xtls-rprx-vision' })
          decryption = 'none'
        }
        streamSettings = @{
          network = 'raw'
          security = 'reality'
          realitySettings = @{
            show = $true
            target = '127.0.0.1:19443'
            serverNames = @($ServerName)
            privateKey = $PrivateKey
            minClientVer = $MinClientVersion
            shortIds = @($ShortId)
          }
        }
      }
    )
    outbounds = @(@{ protocol = 'freedom'; tag = 'direct' })
  }
  if ($Mldsa65) {
    $XrayConfig.inbounds[0].streamSettings.realitySettings.mldsa65Seed = $MldsaSeed
  }
  $XrayConfigPath = Join-Path $TestRoot 'xray.json'
  $XrayConfig | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $XrayConfigPath -Encoding utf8NoBOM

  $MldsaLine = if ($Mldsa65) { "      mldsa65-verify: $MldsaVerify`n" } else { '' }
  $MihomoConfig = @"
mixed-port: 17890
allow-lan: false
mode: global
log-level: debug
external-controller: 127.0.0.1:19090
proxies:
  - name: modern-reality
    type: vless
    server: 127.0.0.1
    port: 18443
    uuid: $Uuid
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    servername: $ServerName
    client-fingerprint: chrome
    reality-opts:
      public-key: $PublicKey
      short-id: $ShortId
${MldsaLine}      support-x25519mlkem768: true
      fragment-client-hello: $($FragmentClientHello.IsPresent.ToString().ToLowerInvariant())
proxy-groups:
  - name: GLOBAL
    type: select
    proxies:
      - modern-reality
rules:
  - MATCH,GLOBAL
"@
  $MihomoConfigPath = Join-Path $TestRoot 'mihomo.yaml'
  $MihomoConfig | Set-Content -LiteralPath $MihomoConfigPath -Encoding utf8NoBOM

  $XrayOut = Join-Path $TestRoot 'xray.out.log'
  $XrayErr = Join-Path $TestRoot 'xray.err.log'
  $MihomoOut = Join-Path $TestRoot 'mihomo.out.log'
  $MihomoErr = Join-Path $TestRoot 'mihomo.err.log'

  & $XrayExe run -test -config $XrayConfigPath *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Generated Xray config validation failed' }
  & $MihomoExe -t -f $MihomoConfigPath *> $null
  if ($LASTEXITCODE -ne 0) { throw 'Generated Mihomo config validation failed' }

  $TargetProcess = Start-Process -FilePath 'node.exe' -ArgumentList @('target.cjs') -WorkingDirectory $TestRoot -WindowStyle Hidden -PassThru
  Start-Sleep -Milliseconds 500
  if ($TargetProcess.HasExited) { throw 'Local TLS target exited before Xray started' }

  $XrayProcess = Start-Process -FilePath $XrayExe -ArgumentList @('run', '-config', $XrayConfigPath) -WorkingDirectory $TestRoot -WindowStyle Hidden -RedirectStandardOutput $XrayOut -RedirectStandardError $XrayErr -PassThru
  Start-Sleep -Milliseconds 800
  if ($XrayProcess.HasExited) { throw 'Xray test server exited before the client started' }

  $MihomoProcess = Start-Process -FilePath $MihomoExe -ArgumentList @('-d', $TestRoot, '-f', $MihomoConfigPath) -WorkingDirectory $TestRoot -WindowStyle Hidden -RedirectStandardOutput $MihomoOut -RedirectStandardError $MihomoErr -PassThru
  Start-Sleep -Seconds 2
  if ($MihomoProcess.HasExited) { throw 'Mihomo test client exited before the request' }

  $Status = & curl.exe --silent --show-error --max-time 20 --output NUL --write-out '%{http_code}' --proxy 'http://127.0.0.1:17890' 'http://cp.cloudflare.com/generate_204'
  if ($LASTEXITCODE -ne 0 -or $Status -ne '204') {
    Stop-TestProcess -Process $MihomoProcess
    Stop-TestProcess -Process $XrayProcess
    $SafeErrors = @(Get-Content -LiteralPath $MihomoOut -ErrorAction SilentlyContinue | Select-String -Pattern 'REALITY|connect error|authentication|timeout|EOF' | Select-Object -Last 12)
    $ServerLog = (Get-Content -LiteralPath $XrayOut,$XrayErr -Raw -ErrorAction SilentlyContinue) -join "`n"
    $AuthKeyDerived = $ServerLog -match 'AuthKey\[:16\]'
    $SessionDecrypted = $ServerLog -match 'ClientVer:'
    $Accepted = $ServerLog -match 'conn == conn: true'
    $ClientHelloSeen = $ServerLog -match 'conn == conn:'
    $SniSeen = $ServerLog -match 'forwarded SNI: www\.microsoft\.com'
    $ClientVersion = if ($ServerLog -match 'ClientVer:\s*\[([0-9 ]+)\]') { $Matches[1] -replace ' ', '.' } else { 'unavailable' }
    $ClientLog = (Get-Content -LiteralPath $MihomoOut,$MihomoErr -Raw -ErrorAction SilentlyContinue) -join "`n"
    $Authenticated = $ClientLog -match 'REALITY Authentication: true'
    $HybridNegotiated = $ClientLog -match 'using X25519MLKEM768 for TLS.+true'
    if ($Authenticated -and $HybridNegotiated -and $Accepted) {
      "modern-reality-local=passed|xray=26.9.9|mldsa65=$($Mldsa65.IsPresent.ToString().ToLowerInvariant())|x25519mlkem768=true|authentication=true|http=$Status"
      return
    }
    $ServerState = if ($XrayProcess.HasExited) { "exited:$($XrayProcess.ExitCode)" } else { 'running' }
    throw "Modern REALITY request failed (HTTP=$Status). Client diagnostics: $($SafeErrors -join ' | ') Server=$ServerState clientHelloSeen=$ClientHelloSeen sniSeen=$SniSeen authKeyDerived=$AuthKeyDerived sessionDecrypted=$SessionDecrypted accepted=$Accepted clientVersion=$ClientVersion"
  }

  $Log = Get-Content -LiteralPath $MihomoOut -Raw
  if ($Log -notmatch 'REALITY Authentication: true') {
    throw 'HTTP request passed but Mihomo did not report successful REALITY authentication'
  }
  if ($Log -notmatch 'using X25519MLKEM768 for TLS.+true') {
    throw 'HTTP request passed but the hybrid X25519MLKEM768 exchange was not negotiated'
  }

  'modern-reality-local=passed|xray=26.9.9|mldsa65=true|x25519mlkem768=true|http=204'
}
finally {
  Stop-TestProcess -Process $MihomoProcess
  Stop-TestProcess -Process $XrayProcess
  Stop-TestProcess -Process $TargetProcess
  if (-not $KeepArtifacts -and (Test-Path -LiteralPath $TestRoot)) {
    $Resolved = [IO.Path]::GetFullPath($TestRoot)
    if ($Resolved.StartsWith($TempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $Resolved).StartsWith('slave-modern-reality-')) {
      Remove-Item -LiteralPath $Resolved -Recurse -Force
    }
  }
  if ($KeepArtifacts) { "artifacts=$TestRoot" }
}

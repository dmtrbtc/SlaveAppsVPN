#requires -Version 7.2

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string] $XrayExe,

  [string] $MihomoExe = 'apps/windows/resources/bin/mihomo.exe',

  [switch] $FragmentClientHello,

  [switch] $Mldsa65,

  [switch] $ReferenceClient,

  [bool] $HybridKeyShare = $true,

  [ValidateRange(1, 50)]
  [int] $Repetitions = 8,

  [string] $MinClientVersion = '26.9.9',

  [switch] $KeepArtifacts
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$XrayExe = (Resolve-Path -LiteralPath $XrayExe).Path
$MihomoExe = (Resolve-Path -LiteralPath $(if ([IO.Path]::IsPathRooted($MihomoExe)) { $MihomoExe } else { Join-Path $RepoRoot $MihomoExe })).Path
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
const http = require('http')
const https = require('https')
https.createServer({
  cert: fs.readFileSync('target.crt'),
  key: fs.readFileSync('target.key'),
}, (_req, res) => {
  res.writeHead(204)
  res.end()
}).listen(19443, '127.0.0.1')
http.createServer((_req, res) => {
  res.writeHead(204)
  res.end()
}).listen(18080, '127.0.0.1')
https.createServer({
  cert: fs.readFileSync('target.crt'),
  key: fs.readFileSync('target.key'),
}, (req, res) => {
  if (req.url !== '/transfer') { res.writeHead(204); res.end(); return }
  const chunks = []
  let size = 0
  req.on('data', chunk => {
    size += chunk.length
    if (size > 262144) { req.destroy(); return }
    chunks.push(chunk)
  })
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    if (!body.equals(Buffer.alloc(262144, 0x5a))) { res.writeHead(400); res.end(); return }
    res.writeHead(200, { 'Content-Length': body.length, Connection: 'close' })
    res.end(body)
  })
}).listen(18081, '127.0.0.1')
'@ | Set-Content -LiteralPath (Join-Path $TestRoot 'target.cjs') -Encoding utf8NoBOM
  @'
const http = require('http')
const tls = require('tls')
if (process.argv.includes('--direct')) {
  const direct = require('https').get('https://127.0.0.1:18081/generate_204', { rejectUnauthorized: false }, res => {
    process.stdout.write(String(res.statusCode))
    res.resume()
  }).on('error', error => { console.error(error.message); process.exitCode = 1 })
  direct.setTimeout(5000, () => direct.destroy(new Error('direct origin timeout')))
} else {
const req = http.request({
  host: '127.0.0.1',
  port: 17890,
  method: 'CONNECT',
  path: '127.0.0.1:18081',
})
req.setTimeout(20000, () => req.destroy(new Error('CONNECT timeout')))
req.on('connect', (res, socket) => {
  if (res.statusCode !== 200) {
    socket.destroy()
    throw new Error(`CONNECT status ${res.statusCode}`)
  }
  const secure = tls.connect({ socket, servername: 'localhost', rejectUnauthorized: false })
  secure.setTimeout(20000, () => secure.destroy(new Error('TLS request timeout')))
  const response = []
  const payload = Buffer.alloc(262144, 0x5a)
  secure.on('secureConnect', () => {
    secure.write(`POST /transfer HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Length: ${payload.length}\r\n\r\n`)
    secure.write(payload)
  })
  secure.on('data', chunk => { response.push(chunk) })
  secure.on('end', () => {
    const result = Buffer.concat(response)
    const boundary = result.indexOf('\r\n\r\n')
    if (boundary < 0 || !/^HTTP\/1\.[01] 200\b/.test(result.subarray(0, boundary).toString('latin1'))) {
      throw new Error('missing successful HTTP status')
    }
    if (!result.subarray(boundary + 4).equals(payload)) throw new Error('round-trip payload mismatch')
    process.stdout.write('transfer-ok')
  })
  secure.on('error', error => { console.error(error.message); process.exitCode = 1 })
})
req.on('error', error => { console.error(error.message); process.exitCode = 1 })
req.end()
}
'@ | Set-Content -LiteralPath (Join-Path $TestRoot 'probe.cjs') -Encoding utf8NoBOM

  $XrayConfig = [ordered]@{
    log = @{ loglevel = 'debug' }
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
    # Xray 26.9.9 blocks private destinations by default. Allow only our two
    # loopback origins in this ephemeral test server, never in client configs.
    outbounds = @(@{ protocol = 'freedom'; tag = 'direct'; settings = @{
      finalRules = @(@{ action = 'allow'; network = 'tcp'; ip = @('127.0.0.1/32'); port = '18080-18081' })
    } })
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
${MldsaLine}      support-x25519mlkem768: $($HybridKeyShare.ToString().ToLowerInvariant())
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

  $ReferenceConfigPath = Join-Path $TestRoot 'reference.json'
  $ReferenceReality = @{ fingerprint = 'chrome'; serverName = $ServerName; password = $PublicKey; shortId = $ShortId }
  if ($Mldsa65) { $ReferenceReality.mldsa65Verify = $MldsaVerify }
  @{
    log = @{ loglevel = 'debug' }
    inbounds = @(@{ listen = '127.0.0.1'; port = 17890; protocol = 'http'; settings = @{} })
    outbounds = @(@{
      protocol = 'vless'
      settings = @{ vnext = @(@{ address = '127.0.0.1'; port = 18443; users = @(@{ id = $Uuid; encryption = 'none'; flow = 'xtls-rprx-vision' }) }) }
      streamSettings = @{ network = 'raw'; security = 'reality'; realitySettings = $ReferenceReality }
    })
  } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $ReferenceConfigPath -Encoding utf8NoBOM

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
  $DirectStatus = & node.exe (Join-Path $TestRoot 'probe.cjs') --direct
  if ($LASTEXITCODE -ne 0 -or $DirectStatus -ne '204') { throw 'Local HTTPS origin failed direct control probe' }

  $XrayProcess = Start-Process -FilePath $XrayExe -ArgumentList @('run', '-config', $XrayConfigPath) -WorkingDirectory $TestRoot -WindowStyle Hidden -RedirectStandardOutput $XrayOut -RedirectStandardError $XrayErr -PassThru
  Start-Sleep -Milliseconds 800
  if ($XrayProcess.HasExited) { throw 'Xray test server exited before the client started' }

  if ($ReferenceClient) {
    $MihomoProcess = Start-Process -FilePath $XrayExe -ArgumentList @('run', '-config', $ReferenceConfigPath) -WorkingDirectory $TestRoot -WindowStyle Hidden -RedirectStandardOutput $MihomoOut -RedirectStandardError $MihomoErr -PassThru
  } else {
    $MihomoProcess = Start-Process -FilePath $MihomoExe -ArgumentList @('-d', $TestRoot, '-f', $MihomoConfigPath) -WorkingDirectory $TestRoot -WindowStyle Hidden -RedirectStandardOutput $MihomoOut -RedirectStandardError $MihomoErr -PassThru
  }
  Start-Sleep -Seconds 2
  if ($MihomoProcess.HasExited) { throw 'Mihomo test client exited before the request' }

  # Use a separate local HTTPS origin as the VLESS destination. Port 19443 above
  # is only the REALITY camouflage target; reaching it does not prove that an
  # authenticated VLESS request crossed the tunnel. Each new connection must
  # round-trip 256 KiB exactly, exercising Vision's inner-TLS/direct-copy path.
  for ($Attempt = 1; $Attempt -le $Repetitions; $Attempt++) {
  $ProbeOutput = @(& node.exe (Join-Path $TestRoot 'probe.cjs') 2>&1)
  $ProbeExitCode = $LASTEXITCODE
  $Status = ($ProbeOutput -join "`n").Trim()
  if ($ProbeExitCode -ne 0 -or $Status -ne 'transfer-ok') {
    $ServerState = if ($XrayProcess.HasExited) { "exited:$($XrayProcess.ExitCode)" } else { 'running' }
    Stop-TestProcess -Process $MihomoProcess
    Stop-TestProcess -Process $XrayProcess
    $SafeErrors = @(Get-Content -LiteralPath $MihomoOut -ErrorAction SilentlyContinue | Select-String -Pattern 'REALITY|connect error|authentication|timeout|EOF' | Select-Object -Last 12)
    $ServerLog = (Get-Content -LiteralPath $XrayOut,$XrayErr -Raw -ErrorAction SilentlyContinue) -join "`n"
    $AuthKeyDerived = $ServerLog -match 'AuthKey\[:16\]'
    $SessionDecrypted = $ServerLog -match 'ClientVer:'
    $Accepted = $ServerLog -match 'conn == conn: true'
    $ClientHelloSeen = $ServerLog -match 'conn == conn:'
    $SniSeen = $ServerLog -match ('forwarded SNI: ' + [regex]::Escape($ServerName))
    $ClientVersion = if ($ServerLog -match 'ClientVer:\s*\[([0-9 ]+)\]') { $Matches[1] -replace ' ', '.' } else { 'unavailable' }
    $ClientLog = (Get-Content -LiteralPath $MihomoOut,$MihomoErr -Raw -ErrorAction SilentlyContinue) -join "`n"
    $Authenticated = $ClientLog -match 'REALITY Authentication: true'
    $HybridNegotiated = $ClientLog -match 'using X25519MLKEM768 for TLS.+true'
    throw "Modern REALITY end-to-end request failed (HTTP=$Status probe=$($ProbeOutput -join ' | ')). Client diagnostics: $($SafeErrors -join ' | ') Server=$ServerState authenticated=$Authenticated hybrid=$HybridNegotiated clientHelloSeen=$ClientHelloSeen sniSeen=$SniSeen authKeyDerived=$AuthKeyDerived sessionDecrypted=$SessionDecrypted accepted=$Accepted clientVersion=$ClientVersion"
  }
  }

  $Log = Get-Content -LiteralPath $MihomoOut -Raw
  if ($ReferenceClient) {
    "modern-reality-reference=passed|http=200|bytesEachWay=262144|connections=$Repetitions"
    return
  }
  if ($Log -notmatch 'REALITY Authentication: true') {
    throw 'HTTP request passed but Mihomo did not report successful REALITY authentication'
  }
  if ($HybridKeyShare -and $Log -notmatch 'using X25519MLKEM768 for TLS.+true') {
    throw 'HTTP request passed but the hybrid X25519MLKEM768 exchange was not negotiated'
  }

  "modern-reality-local=passed|xray=26.9.9|mldsa65=$($Mldsa65.IsPresent.ToString().ToLowerInvariant())|hybridRequested=$($HybridKeyShare.ToString().ToLowerInvariant())|authentication=true|vless=true|http=200|bytesEachWay=262144|connections=$Repetitions"
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

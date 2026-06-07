# Tunnel verification script — run AFTER connecting in the app
# Usage: powershell -ExecutionPolicy Bypass -File verify_tunnel.ps1

Write-Host "`n=== SLAVE VPN Tunnel Verification ===" -ForegroundColor Cyan

# 1. Mihomo process
Write-Host "`n--- 1. Mihomo Process ---" -ForegroundColor Yellow
$mihomo = Get-Process -Name "mihomo" -ErrorAction SilentlyContinue
if ($mihomo) {
    Write-Host "OK: Mihomo running PID=$($mihomo.Id)" -ForegroundColor Green
} else {
    Write-Host "FAIL: Mihomo process not found" -ForegroundColor Red
}

# 2. TUN adapter
Write-Host "`n--- 2. TUN Adapter ---" -ForegroundColor Yellow
$netsh = netsh interface show interface 2>&1
if ($netsh -match "Mihomo") {
    Write-Host "OK: Mihomo TUN adapter visible in netsh" -ForegroundColor Green
    $netsh | Select-String "Mihomo"
} elseif ($netsh -match "Meta") {
    Write-Host "WARN: TUN adapter 'Meta' found (old name), expected 'Mihomo'" -ForegroundColor Yellow
    $netsh | Select-String "Meta"
} else {
    Write-Host "FAIL: No Mihomo/Meta TUN adapter found" -ForegroundColor Red
    Write-Host "Full netsh output:"
    $netsh
}

# 3. System proxy (WinINET)
Write-Host "`n--- 3. System Proxy (WinINET) ---" -ForegroundColor Yellow
$proxyEnable = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -ErrorAction SilentlyContinue).ProxyEnable
$proxyServer = (Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyServer -ErrorAction SilentlyContinue).ProxyServer
if ($proxyEnable -eq 1) {
    Write-Host "OK: Proxy enabled → $proxyServer" -ForegroundColor Green
} else {
    Write-Host "FAIL: Proxy not enabled (ProxyEnable=$proxyEnable, ProxyServer=$proxyServer)" -ForegroundColor Red
}

# 4. Ports listening
Write-Host "`n--- 4. Mihomo Ports ---" -ForegroundColor Yellow
$port7890 = netstat -ano | Select-String ":7890\s.*LISTENING"
$port9090 = netstat -ano | Select-String ":9090\s.*LISTENING"
$port1053 = netstat -ano | Select-String ":1053"
if ($port7890) { Write-Host "OK: 7890 (mixed-port) listening" -ForegroundColor Green } else { Write-Host "FAIL: 7890 not listening" -ForegroundColor Red }
if ($port9090) { Write-Host "OK: 9090 (API) listening" -ForegroundColor Green } else { Write-Host "FAIL: 9090 not listening" -ForegroundColor Red }
if ($port1053) { Write-Host "OK: 1053 (DNS) listening" -ForegroundColor Green } else { Write-Host "WARN: 1053 (DNS) not listening (TUN dns-hijack may still work)" -ForegroundColor Yellow }

# 5. Mihomo API check
Write-Host "`n--- 5. Mihomo API ---" -ForegroundColor Yellow
try {
    $ver = Invoke-RestMethod -Uri "http://127.0.0.1:9090/version" -TimeoutSec 3
    Write-Host "OK: Mihomo API responding — version=$($ver.version)" -ForegroundColor Green
} catch {
    Write-Host "FAIL: Mihomo API not responding: $_" -ForegroundColor Red
}

# 6. Traffic through proxy
Write-Host "`n--- 6. Traffic via Proxy ---" -ForegroundColor Yellow
try {
    $ip = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -Proxy "http://127.0.0.1:7890" -TimeoutSec 10).ip
    Write-Host "OK: Outbound IP via proxy: $ip" -ForegroundColor Green
} catch {
    Write-Host "FAIL: Cannot reach ipify through proxy: $_" -ForegroundColor Red
}

# 7. Direct (system default) IP
Write-Host "`n--- 7. Direct Outbound IP ---" -ForegroundColor Yellow
try {
    $directIp = (Invoke-RestMethod -Uri "https://api.ipify.org?format=json" -TimeoutSec 10).ip
    Write-Host "Direct (no proxy) IP: $directIp" -ForegroundColor White
} catch {
    Write-Host "WARN: Cannot reach ipify directly: $_" -ForegroundColor Yellow
}

# 8. Route table — default route
Write-Host "`n--- 8. Default Route ---" -ForegroundColor Yellow
$routes = route print 0.0.0.0 2>&1
Write-Host $routes

# 9. Generated config check
Write-Host "`n--- 9. Generated Config ---" -ForegroundColor Yellow
$configPath = "$env:APPDATA\@slave-vpn\windows\mihomo\config.yaml"
if (Test-Path $configPath) {
    Write-Host "Config file: $configPath ($('{0:N0}' -f (Get-Item $configPath).Length) bytes)"
    $cfg = Get-Content $configPath -Raw
    # Show key fields
    $fields = @('tun:', 'sniffer:', 'dns:', 'rules:', 'strict-route', 'device:')
    foreach ($f in $fields) {
        $lines = $cfg -split "`n" | Where-Object { $_ -match [regex]::Escape($f) }
        if ($lines) { $lines | ForEach-Object { Write-Host "  $_" } }
    }
} else {
    Write-Host "WARN: Config not found at $configPath" -ForegroundColor Yellow
}

Write-Host "`n=== Verification Complete ===" -ForegroundColor Cyan

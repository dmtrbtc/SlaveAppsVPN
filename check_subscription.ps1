# Subscription diagnostic — run after clicking Connect in the app
# Usage: powershell -ExecutionPolicy Bypass -File check_subscription.ps1

Write-Host "`n=== Subscription Diagnostics ===" -ForegroundColor Cyan

$logPath = "$env:APPDATA\@slave-vpn\windows\logs\main.log"

if (-not (Test-Path $logPath)) {
    Write-Host "FAIL: Log file not found at $logPath" -ForegroundColor Red
    exit 1
}

Write-Host "Log: $logPath" -ForegroundColor Gray

# Parse all JSON log entries
$entries = Get-Content $logPath | ForEach-Object {
    try { $_ | ConvertFrom-Json } catch { $null }
} | Where-Object { $_ -ne $null }

# Get the most recent session
$lastSession = ($entries | Select-Object -Last 1).session
Write-Host "Current session: $lastSession" -ForegroundColor Gray

$sessionEntries = $entries | Where-Object { $_.session -eq $lastSession }

Write-Host "`n--- Subscription-related log entries ---" -ForegroundColor Yellow
$subEntries = $sessionEntries | Where-Object {
    $_.msg -match 'subscription' -or
    $_.msg -match 'config source' -or
    $_.msg -match 'YAML' -or
    $_.msg -match 'parse failed' -or
    $_.msg -match 'HTTP error'
}

if ($subEntries) {
    foreach ($e in $subEntries) {
        $level = switch ($e.level) { 50 { 'ERROR' } 40 { 'WARN' } 30 { 'INFO' } default { $e.level } }
        $time = [DateTimeOffset]::FromUnixTimeMilliseconds($e.time).LocalDateTime.ToString('HH:mm:ss')
        Write-Host "[$time] $level  $($e.msg)" -ForegroundColor $(if ($e.level -ge 50) { 'Red' } elseif ($e.level -ge 40) { 'Yellow' } else { 'White' })

        # Show extra fields that help diagnose the subscription
        if ($e.urlDomain)        { Write-Host "         urlDomain: $($e.urlDomain)" -ForegroundColor Cyan }
        if ($e.ua)               { Write-Host "         ua: $($e.ua)" -ForegroundColor Gray }
        if ($e.status)           { Write-Host "         status: $($e.status)" -ForegroundColor Gray }
        if ($e.parseError)       { Write-Host "         parseError: $($e.parseError)" -ForegroundColor Red }
        if ($e.responseLength)   { Write-Host "         responseLength: $($e.responseLength) chars" -ForegroundColor Gray }
        if ($e.responsePreview)  {
            Write-Host "         responsePreview (first 600 chars):" -ForegroundColor Magenta
            Write-Host $e.responsePreview -ForegroundColor Magenta
        }
        if ($e.error -and $e.error.message) {
            Write-Host "         error: $($e.error.message)" -ForegroundColor Red
        }
    }
} else {
    Write-Host "No subscription-related entries found in current session." -ForegroundColor Yellow
    Write-Host "Make sure to click Connect in the app before running this script." -ForegroundColor Yellow
}

Write-Host "`n--- Recent errors (last 5) ---" -ForegroundColor Yellow
$recentErrors = $sessionEntries | Where-Object { $_.level -ge 40 } | Select-Object -Last 5
foreach ($e in $recentErrors) {
    $level = switch ($e.level) { 50 { 'ERROR' } 40 { 'WARN' } 30 { 'INFO' } default { $e.level } }
    $time = [DateTimeOffset]::FromUnixTimeMilliseconds($e.time).LocalDateTime.ToString('HH:mm:ss')
    $msg = if ($e.error -and $e.error.message) { "$($e.msg): $($e.error.message)" } else { $e.msg }
    Write-Host "[$time] $level  $msg" -ForegroundColor $(if ($e.level -ge 50) { 'Red' } else { 'Yellow' })
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan

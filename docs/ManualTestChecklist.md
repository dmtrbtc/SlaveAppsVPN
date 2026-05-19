# Manual Verification Checklist

Real-world test scenarios for SLAVE VPN Windows client.
Run before any production release.

## SCENARIO 1: Clean Install

**Setup**: Fresh Windows 10/11 machine, no previous installation.

```
Steps:
1. Run SlaveAppsVPN-Setup-vX.Y.Z.exe
2. Follow installer wizard
3. Launch app
4. Observe startup
```

Expected:
- [ ] Window appears within 5 seconds (no black screen)
- [ ] No SmartScreen block (or user accepts it)
- [ ] Onboarding screen shown (no config source configured)
- [ ] Diagnostics > Запуск shows all phases green
- [ ] No errors in Diagnostics > Runtime события

---

## SCENARIO 2: Upgrade Install

**Setup**: Previous version installed and configured with subscription URL.

```
Steps:
1. Note current auth state and config source
2. Run new installer over existing installation
3. Observe migration
```

Expected:
- [ ] Auth tokens preserved (not logged out)
- [ ] Config source preserved (subscription URL intact)
- [ ] Settings preserved (mode, autostart, etc.)
- [ ] VPN connects on first try after upgrade

---

## SCENARIO 3: Subscription URL (Clash YAML)

```
Steps:
1. Add subscription URL in settings
2. Validate
3. Connect
```

Expected:
- [ ] Validation shows proxy count and protocol breakdown
- [ ] Servers page populates with nodes
- [ ] Connect succeeds (state → connected)
- [ ] Active proxy shown in Diagnostics

---

## SCENARIO 4: Reality Nodes

**Requires**: Server with VLESS Reality configured.

```
Steps:
1. Connect to a Reality node
2. Check Diagnostics security badge
3. Browse to detect real IP
```

Expected:
- [ ] REALITY badge shown in Servers list for the node
- [ ] Security badge "REALITY" appears in Diagnostics when connected
- [ ] IP address matches server country
- [ ] No Reality handshake errors in Runtime события

---

## SCENARIO 5: Reconnect After Sleep

```
Steps:
1. Connect VPN
2. Put computer to sleep (Win+L → sleep)
3. Wake up after 2+ minutes
4. Observe reconnection
```

Expected:
- [ ] Reconnect attempt logged in Runtime события
- [ ] VPN reconnects within 30 seconds of wake
- [ ] Reconnect count increments in Diagnostics
- [ ] No stuck "connecting" state after 60 seconds

---

## SCENARIO 6: Reconnect After Network Loss

```
Steps:
1. Connect VPN
2. Disable network adapter (Device Manager)
3. Wait 30 seconds
4. Re-enable adapter
```

Expected:
- [ ] Health monitor detects `connectivityOk=false`
- [ ] Suggestion shown in Diagnostics ("check proxy or switch node")
- [ ] VPN attempts reconnect after network restored
- [ ] No hang — recovers within 60 seconds

---

## SCENARIO 7: Broken Subscription

```
Steps:
1. Set subscription URL to a URL that returns 404 or garbage
2. Try to connect
```

Expected:
- [ ] Error: "Subscription has no usable proxies" (not silent failure)
- [ ] Stale cache used if available (atomic rollback)
- [ ] Error shown in Runtime события: vpn.preflight_failed
- [ ] No Mihomo process spawned

---

## SCENARIO 8: Malformed Nodes

```
Steps:
1. Set subscription with some invalid VLESS links (bad pbk, wrong port, etc.)
2. Validate
3. Connect to an invalid node
```

Expected:
- [ ] Invalid nodes flagged by ConnectionCompatibilityValidator
- [ ] Valid nodes still shown and connectable
- [ ] Reality validation error shown if pbk is not 64-hex chars
- [ ] Connection failure classified (proxy.reality_error or proxy.timeout)

---

## SCENARIO 9: Offline Startup

**Setup**: No network connection when app starts.

```
Steps:
1. Disconnect from all networks
2. Start app
```

Expected:
- [ ] App starts (no crash, no black screen)
- [ ] Bootstrap completes with warning (subscription cache used)
- [ ] Diagnostics shows `connectivityOk=false`
- [ ] Can open settings and diagnostics
- [ ] Connect attempt shows appropriate error (not silent hang)

---

## SCENARIO 10: Provider Unavailable

**Setup**: API base URL unreachable (block it in firewall or wrong URL).

```
Steps:
1. Start app with auth tokens configured
2. Observe subscription refresh failure
```

Expected:
- [ ] Stale subscription cache used (not empty)
- [ ] Warning logged: "Failed to pre-warm subscription cache"
- [ ] Connect still works using cached subscription
- [ ] Subscription page shows stale state (not error screen)

---

## SCENARIO 11: DNS Failure

**Setup**: Block DNS (set DNS server to 0.0.0.0 in adapter settings).

```
Steps:
1. Connect VPN
2. Block system DNS
3. Observe health check
```

Expected:
- [ ] Health: `dnsOk=false` within 30 seconds
- [ ] Suggestion: "DNS не работает — попробуйте сменить DNS-профиль"
- [ ] DNS inside tunnel still works (Mihomo has built-in DNS)

---

## SCENARIO 12: Mihomo Crash Recovery

**Setup**: Force-kill mihomo.exe from Task Manager while connected.

```
Steps:
1. Connect VPN
2. Open Task Manager
3. Kill mihomo.exe process
```

Expected:
- [ ] RuntimeManager detects crash within 5 seconds
- [ ] State transitions to `crashed` → `reconnecting`
- [ ] RecoveryCoordinator initiates reconnect
- [ ] VPN reconnects automatically (no manual intervention needed)
- [ ] Runtime события shows: reconnect.attempt

---

## SCENARIO 13: Double Connect

```
Steps:
1. Click Connect button rapidly multiple times
2. Observe state
```

Expected:
- [ ] Only one connection attempt occurs (mutex guard)
- [ ] Subsequent clicks return error "Connection already in progress"
- [ ] No duplicate Mihomo processes

---

## SCENARIO 14: Orphan Process on Startup

**Setup**: Kill app without graceful shutdown (Task Manager → End Task on electron.exe).
Then restart.

```
Steps:
1. Connect VPN
2. Kill app from Task Manager (not graceful)
3. Start app again
4. Connect
```

Expected:
- [ ] Preflight detects orphan on port 7890
- [ ] killOrphanOnPort() kills the orphan process
- [ ] Port freed and Mihomo starts normally
- [ ] No API_PORT_IN_USE error blocking connection

---

## PASS CRITERIA

All 14 scenarios must pass before promoting to stable channel.

Beta channel: scenarios 1, 3, 4, 5, 12, 13, 14 required.

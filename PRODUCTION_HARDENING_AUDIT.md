# Production Hardening Audit — v0.3.0-rc1

**Date:** 2026-05-18  
**Branch:** `feature/production-hardening`

---

## Coverage Matrix

| Category | Component | Status | Notes |
|----------|-----------|--------|-------|
| **Startup Safety** | SafeModeManager | ✅ | 3-strike crash loop, 60s healthy mark |
| **Startup Safety** | CrashLoopDetector | ✅ | launch-record.json persisted |
| **Startup Safety** | StartupRecovery (settings) | ✅ | SettingsStore uses spread-merge fallback |
| **Startup Safety** | Bootstrap timeout | ✅ | 30s timeout, degraded-mode fallback |
| **Runtime Recovery** | RecoveryCoordinator | ✅ | Exponential backoff 1→16s, 5 attempts |
| **Runtime Recovery** | Reconnect after sleep/wake | ✅ | powerMonitor resume → triggerReconnect |
| **Runtime Recovery** | Fatal engine error notification | ✅ | IpcChannel.EVENT_VPN_ERROR |
| **Node Health** | NodeHealthManager | ✅ | Per-node failure counter + quarantine |
| **Node Health** | Reality handshake failure tracking | ✅ | Records against activeProxy |
| **Node Health** | Node quarantine with backoff | ✅ | 30s–5min exponential |
| **Node Health** | Per-node success recovery | ✅ | recordSuccess on running state |
| **Subscription** | Multi-format detection | ✅ | YAML / Base64 / raw links |
| **Subscription** | Multi-UA fetching | ✅ | 4 UA variants + placeholder detection |
| **Subscription** | ETag caching | ✅ | 5-min TTL, stale-on-error fallback |
| **Subscription** | Node preview | ✅ | Protocol badges + sample nodes |
| **Subscription** | Duplicate detection | ✅ | (via YAML passthrough dedup in normalizer) |
| **Connectivity** | Captive portal detection | ✅ | HTTP 204 check, passive (on demand only) |
| **Connectivity** | DNS failure detection | ✅ | HealthMonitor + dnsOk flag |
| **Connectivity** | TUN availability check | ✅ | Pre-flight + tunAvailable flag |
| **Connectivity** | API port conflict check | ✅ | Pre-flight isPortFree() |
| **Connectivity** | Actionable suggestions | ✅ | buildSuggestion() → suggestion field |
| **Connectivity** | Health score | ✅ | 0-100 composite (6 weighted flags) |
| **Updates** | Manual check / download / install | ✅ | UpdateService |
| **Updates** | Channel selection (stable/beta) | ✅ | Persisted in settings |
| **Updates** | No auto-install | ✅ | autoDownload=false |
| **Updates** | Download progress events | ✅ | EVENT_UPDATE_PROGRESS |
| **Logging** | Structured logging (pino) | ✅ | JSON lines, serializers |
| **Logging** | Log rotation (5 MB) | ✅ | 3 backups retained |
| **Logging** | Session ID in all entries | ✅ | 8-char UUID prefix |
| **Logging** | Build commit in entries | ✅ | __APP_COMMIT__ |
| **Logging** | Crash log (crash.log) | ✅ | writeCrashLog() before logger init |
| **Logging** | ZIP export | ✅ | PowerShell Compress-Archive |
| **UI Safety** | Safe mode banner | ✅ | Orange dismissible bar with actions |
| **UI Safety** | Error boundary | ✅ | ErrorBoundary.tsx at root |
| **UI Safety** | Bootstrap timeout fallback | ✅ | 30s → proceeds without waiting |
| **UI Safety** | Offline banner | ✅ | OfflineBanner.tsx |
| **Accessibility** | Focus rings | ✅ | :focus-visible CSS |
| **Accessibility** | Reduced motion | ✅ | @media (prefers-reduced-motion) |
| **Accessibility** | aria-label on banners | ✅ | SafeModeBanner, OfflineBanner |
| **IPC Security** | Zod validation all invoke channels | ✅ | handleIpc() wrapper |
| **IPC Security** | contextIsolation | ✅ | Electron default |
| **IPC Security** | No Electron imports in renderer | ✅ | Bridge-only renderer access |
| **Architecture** | Provider-neutral runtime | ✅ | ConfigSource + VPNProvider interfaces |
| **Architecture** | Engine-neutral runtime | ✅ | RuntimeManager abstraction |
| **Architecture** | No circular deps | ✅ | packages/* never import from apps/* |

---

## Outstanding Items (not in scope for v0.3.0-rc1)

| Item | Reason |
|------|--------|
| Code signing (EV cert) | Certificate procurement required |
| Auto-update in dev | `app.isPackaged` gate by design |
| Outbound IP detection | Privacy-sensitive, deferred |
| Split tunnel process picker | Future iteration |
| Per-node latency measurement | Requires active probing through proxy |
| Remnawave subscription token refresh | Provider-specific, out of scope |
| Telegram login | Integration pending bot API |

---

## Hard Rules Compliance

- ✅ No god services (single responsibility maintained)
- ✅ No hidden singleton state (all singletons exported via getX() factory)
- ✅ No retry storms (RecoveryCoordinator: bounded retries + exhaust event)
- ✅ No polling spam (connectivity: 10s interval; safe mode: 60s)
- ✅ No renderer-side runtime logic
- ✅ Structured logs everywhere
- ✅ Zod validation on all IPC handlers
- ✅ Deterministic cleanup (dispose() on all managers)
- ✅ Graceful degradation (safe mode, stale cache, bootstrap fallback)

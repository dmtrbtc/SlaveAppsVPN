# Changelog

All notable changes to SLAVE VPN are documented here.

## [0.3.0-rc1] — 2026-05-18

### Added

**Safe Mode + Startup Recovery (Iter 9 Stage 4)**
- `SafeModeManager`: detects crash loops (3 failed starts within 45s each), enters safe mode; resets after 60s healthy uptime; persists `launch-record.json` in userData
- `SafeModeBanner`: dismissible orange banner with launch count, reset button, export diagnostics; `useSafeMode` hook polls every 60s
- `SAFE_MODE_GET_STATUS` and `SAFE_MODE_RESET` IPC channels

**Subscription node preview (Iter 9 Stage 5)**
- `ConfigSourceValidateResult` extended with `nodeCount`, `protocols` map, `sampleNodes[]`
- `NodePreviewPanel`: protocol badges (REALITY/WS/gRPC) + first 3 server names shown after validation
- Single-proxy validation returns inline sampleNodes data

**Reality node health (Iter 9 Stage 6)**
- `NodeHealthManager`: per-node failure counter with exponential backoff quarantine (30s→5min cap), 10-min idle cleanup
- Failure recorded against `activeProxy` on every classified Mihomo log error
- `reconnect.success` records success to reduce failure count
- Quarantined node list reported in `getConnectivity()` response

**Connectivity intelligence (Iter 9 Stage 7)**
- `detectCaptivePortal()`: passive HTTP 204 check (only fires when connectivity already broken)
- `buildSuggestion()`: actionable Russian hint based on current health degradation reason
- `VPNConnectivityInfo` gains `captivePortal?`, `quarantinedNodes?`, `suggestion?`
- DiagnosticsPage: captive portal warning + suggestion banner + quarantined count display

**UX polish (Iter 9 Stage 8)**
- `@media (prefers-reduced-motion)`: all animations disabled at CSS level
- `:focus-visible` ring: consistent 2px accent outline across entire app
- `aria-label` on SafeModeBanner, OfflineBanner interactive elements

### Documentation
- `PRODUCTION_HARDENING_AUDIT.md`: full coverage matrix (43 checks)
- `ROADMAP.md`: v0.3→v0.5 feature timeline
- `SECURITY.md`: vulnerability reporting + security design

## [0.3.0-beta] — 2026-05-18

### Added

**Subscription pipeline (Iter 7)**
- VLESS-FIRST parser: full Reality, WS, gRPC, H2, HTTPUpgrade support including `pbk/sid/fp/flow/alpn/packetEncoding`
- Trojan, Hysteria2, TUIC, Shadowsocks parsers
- Proper Mihomo YAML generation (block-style, not JSON.stringify)
- Multi-UA subscription fetching (clash.meta, Mihomo, ClashX, Clash variants) with placeholder detection
- ETag-based HTTP cache with 5-min TTL and stale-on-error fallback
- ConfigSource abstraction: subscription-url, single-proxy, remnawave-key sources
- Onboarding wizard with per-type validation and live preview
- Protocol badges (REALITY / WS / gRPC / TLS) on Servers page

**Runtime stabilization (Iter 8)**
- Pre-flight validation before every `connect()`: checks mihomo.exe, wintun.dll, working dir writable, API port free
- Mihomo log line classifier: detects Reality handshake failures, XTLS flow mismatch, TLS cert errors, DNS resolution failures, connection refused, timeout — 10s deduplication per error kind
- `VPN_GET_CONNECTIVITY` IPC: returns health snapshot (6 status flags + health score 0-100 + active proxy name + proxy count)
- Diagnostics page rewritten: Connectivity panel with health bar, 6 status dots, engine state badge, active proxy

**Production hardening (Iter 9)**
- `UpdateService`: manual check, download, install with per-byte progress tracking; no auto-install without user confirmation
- Update channel selection (stable / beta) persisted to settings
- `EVENT_UPDATE_PROGRESS` push events enable download progress bar in renderer
- Settings page: Updates section with progress bar, channel selector, "Restart and install" button
- `RecoveryCoordinator`: exponential backoff retry (1 → 2 → 4 → 8 → 16 s, max 5 attempts) with `reconnect.exhausted` critical event
- Log rotation: files capped at 5 MB, keeps 3 backups (main.log.1/2/3)
- Session ID and build commit hash injected into every structured log entry
- Diagnostics export: ZIP bundle (main.log + backups + crash.log) via PowerShell Compress-Archive

### Changed

- `autoUpdater.autoDownload` set to `false` — user explicitly triggers download
- `autoUpdater` logic refactored from `index.ts` into `UpdateService` singleton
- `SettingsStore` gains `updateChannel: 'stable' | 'beta'` persistent field
- Logger exports `getSessionId()` for cross-service correlation
- `vpn.handler.ts` fallback uses `INITIAL_VPN_STATUS` from shared package

### Fixed

- `vpn.handler.ts`: VPN_GET_STATUS returned partial non-VPNStatus object when runtime not yet initialized — caused TS type union conflict
- Duplicate `classifyMihomoLogLine` function removed from RuntimeServiceImpl
- `exactOptionalPropertyTypes` spread pattern applied consistently across all sources

## [0.2.0] — 2026-04-xx

- Aurora design system (7 screens rewritten)
- Full IPC infrastructure with Zod validation
- Zustand stores + TanStack Query renderer layer
- RuntimeManager + MihomoEngine + HealthMonitor
- Provider-agnostic architecture with VPNProvider interface
- Electron security hardening (CSP, contextIsolation, contextBridge)

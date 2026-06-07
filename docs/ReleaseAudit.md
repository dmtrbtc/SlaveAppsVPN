# Release Audit Checklist

Pre-release verification for SLAVE VPN Windows client.

## BUILD VERIFICATION

- [ ] `pnpm typecheck` passes (21/21)
- [ ] `pnpm build` completes (no TS errors, no Vite warnings)
- [ ] `pnpm dist` produces installer + portable artifacts
- [ ] Installer artifact: `release/X.Y.Z/SlaveAppsVPN-Setup-vX.Y.Z.exe`
- [ ] Portable artifact: `release/X.Y.Z/SlaveAppsVPN-Portable-vX.Y.Z.exe`
- [ ] `resources/bin/mihomo.exe` present and non-zero size
- [ ] `resources/bin/wintun.dll` present and non-zero size

## STARTUP VERIFICATION

- [ ] Clean install on fresh Windows machine
- [ ] App starts without black screen (window appears within 5s)
- [ ] Preload bridge initializes (no `[IPC] Bridge not available` in logs)
- [ ] IPC handlers registered within 2s of app ready
- [ ] Bootstrap completes within 15s (startup phases in Diagnostics)
- [ ] No `uncaughtException` in crash.log on first run
- [ ] Diagnostics > Запуск shows all phases green

## BINARY & RUNTIME

- [ ] `WindowsMihomoEngine` logs correct `binaryPath` and `binaryExists=true`
- [ ] Preflight passes: no ENGINE_MISSING, no WORKDIR_UNWRITABLE
- [ ] Mihomo starts and API responds at `http://127.0.0.1:7890`
- [ ] TUN adapter visible in Device Manager (wintun)
- [ ] `tunAvailable=true` in Diagnostics connectivity panel

## CONNECTION LIFECYCLE

- [ ] Connect: state transitions idle → starting → running
- [ ] Disconnect: state transitions running → stopping → idle
- [ ] Double-click Connect does not cause race (mutex guards)
- [ ] Rapid connect/disconnect does not corrupt state
- [ ] VPN status updates reach renderer (Dashboard shows connected state)
- [ ] Active proxy name shown in Diagnostics after connect

## SUBSCRIPTION & CONFIG SOURCE

- [ ] Subscription URL source: fetches and normalizes to Clash YAML
- [ ] sing-box JSON subscriptions parse correctly
- [ ] Base64-encoded subscriptions decode correctly
- [ ] Empty subscription → "no usable proxies" error before connect
- [ ] Malformed subscription → atomic rollback to stale cache
- [ ] ETag / Last-Modified conditional requests work (304 = cache hit)

## REALITY & PROTOCOL VALIDATION

- [ ] VLESS Reality nodes connect (Reality badge in Servers page)
- [ ] Invalid pbk (non-64-hex) rejected in ConnectionCompatibilityValidator
- [ ] Invalid fingerprint rejected
- [ ] VLESS + WS/gRPC/h2 nodes connect
- [ ] VMess/Trojan/SS nodes connect
- [ ] Hysteria2/TUIC nodes parse correctly (may not connect without server)

## NODE PROBING

- [ ] Probe button in Servers page triggers latency scan
- [ ] Live latency updates appear per-server via EVENT_SERVER_LATENCY
- [ ] Best node highlighted with Zap indicator
- [ ] TCP probe fallback works when engine is not running
- [ ] NodeHealthTracker quarantines nodes after 3 failures

## RECOVERY & RESILIENCE

- [ ] Mihomo crash → RecoveryCoordinator detects and reconnects
- [ ] System sleep/resume → powerMonitor triggers reconnect
- [ ] Network disconnect → health monitor detects, shows degraded state
- [ ] Captive portal detection fires when internet is blocked
- [ ] Safe mode activates after 3 crashes in 60s (verify SafeModeManager)
- [ ] Safe mode allows UI access without engine initialization

## AUTO-UPDATE

- [ ] `UPDATE_CHECK` returns current version correctly
- [ ] Update download progresses and emits UPDATE_PROGRESS events
- [ ] `UPDATE_INSTALL` triggers app restart
- [ ] Rollback: if update fails, previous version boots correctly
- [ ] Channel switching (stable/beta) works

## DIAGNOSTICS PAGE

- [ ] Startup phases timeline visible and accurate
- [ ] Connectivity panel shows engine state, health score, status dots
- [ ] Active proxy name shown when connected
- [ ] Reality/TLS security badge appears for Reality nodes
- [ ] Mihomo API URL shown with live status dot
- [ ] Last classified error banner appears on error events
- [ ] Reconnect count badge in Runtime events header
- [ ] Config source name shown in System info
- [ ] Export logs produces downloadable archive

## INSTALLER UPGRADE PATH

- [ ] Install v(N-1), then run v(N) installer over it
- [ ] userData migrations do not corrupt existing settings
- [ ] Existing auth tokens survive upgrade
- [ ] Existing config source survives upgrade
- [ ] No duplicate app in Add/Remove Programs

## PORTABLE MODE

- [ ] Portable executable runs without installation
- [ ] userData stored relative to executable
- [ ] No registry entries created
- [ ] Clean removal: delete folder, no leftovers

## KNOWN RISKS & BLOCKERS

| Risk | Severity | Status |
|------|----------|--------|
| WinTUN requires admin for first install | Medium | workaround: asInvoker, docs needed |
| Code signing not yet configured | High | users may see SmartScreen warning |
| Custom NSH WinTUN installer not implemented | Medium | manual driver install required |
| Binary SHA256 not verified on startup | Low | supply chain risk, future work |
| Staged rollout not tested | Low | GitHub Releases channels available |

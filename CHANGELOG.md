# Changelog

All notable changes to SLAVE VPN are documented here.

## [Unreleased]

## [0.2.41-dev.20] — 2026-09-24

### Added

- Privacy setting «Определять страну узлов по IP» (default on): turning it off
  stops sending subscription node IPs to the external ipwho.is geoip service;
  the country falls back to name-based detection.

### Changed

- RU-domain DNS lookups in bypass-style modes now use Yandex DoH carried
  directly (`#DIRECT`) instead of plaintext UDP — encrypted end to end, still
  RU-localised; plaintext remains only as the DoH bootstrap in
  default-nameserver.
- The diagnostics log viewer redacts every string field of each entry in the
  main process (err/url included), matching the export paths.

### Removed

- The per-node REALITY compatibility toggle: the owner's field test against
  the affected node showed no effect (consistent with the server-side root
  cause established in the investigation).

### Fixed

- Onboarding «Проверить/Подключить» buttons wrap to a second row on narrow
  windows instead of clipping.
- Update-banner dismissal expires after 7 days instead of hiding a version
  forever.

### Tests

- URI parser coverage added (ss plain/SIP002, vmess ws+tls/grpc/invalid,
  trojan, safe wrappers, REALITY spx guard).

## [0.2.41-dev.19] — 2026-09-24

### Fixed

- Dev builds now always resolve updates from the Dev channel: a prerelease
  install left on the default "stable" channel could never see any update
  (every newer release is itself a prerelease), stranding installs on old
  dev builds. Settings explains this on dev installs.
- The Android updater no longer offers an APK from Windows-only releases:
  the derived download URL is verified before the banner appears instead of
  failing with 404.
- Node balancer probes authenticate with the real runtime API secret (all
  probes previously failed with HTTP 401) and the balanced node list is
  populated from the aggregated subscription snapshot on every enable.
- Crash-loop autodetection (3 launches within 45s) now actually gates the
  bootstrap into safe mode instead of only logging.
- A failed subscription hot-reload now surfaces as a
  `subscriptions.reload_failed` event in the diagnostics journal instead of
  silently keeping the previous node list.
- A failed latency probe no longer resurrects the node's previous successful
  ping value; mihomo sentinel delays are normalized to unavailable.

### Added

- Optional per-node REALITY compatibility toggle (Servers page, manual node,
  disconnected only): temporarily disables the ML-KEM hybrid key share,
  ML-DSA-65 verification and ClientHello fragmentation for that node's
  handshake. Diagnostic aid for misbehaving servers; easily reversible.

### Security

- Hardened OS invocations (reg/netstat/taskkill via argv arrays, engine
  binary path boundary check). No behavior change.

## [0.2.41-dev.18] — 2026-09-20

### Added

- A local interoperability harness now exercises the packaged Mihomo client
  against Xray 26.9.9 with hybrid X25519/ML-KEM, ML-DSA-65 verification,
  ClientHello fragmentation, and a server-enforced minimum client version.

### Fixed

- Modern REALITY sessions now advertise client version `26.9.9` instead of
  `26.3.27`, so current Xray servers using `minClientVer` no longer silently
  reject an otherwise valid VLESS connection and fall back to timeout/EOF.
- Windows and Android ship the same corrected native handshake implementation.

## [0.2.41-dev.17] — 2026-09-20

### Added

- VLESS REALITY profiles carrying `pqv` now enable narrowly scoped TLS-record
  fragmentation for their enlarged hybrid X25519/ML-KEM ClientHello.
- The fragmentation implementation and payload-preservation behavior are
  covered by native Mihomo tests and shipped in both Windows and Android cores.

### Fixed

- Hybrid REALITY handshakes can traverse mobile networks and middleboxes that
  silently discard an oversized ClientHello spanning ordinary TCP segments.
- Profiles without `pqv` retain the upstream handshake path unchanged.

## [0.2.41-dev.16] — 2026-09-20

### Added

- The bundled Windows and Android Mihomo cores now declare the modern REALITY
  client version required by current Xray servers and verify optional ML-DSA-65
  certificate signatures supplied through the standard `pqv` share-link field.
- Native core patches are pinned to the exact Mihomo source tag, tested, and
  rebuilt reproducibly for both platforms.

### Fixed

- VLESS REALITY subscriptions carrying `pqv` no longer discard the verification
  key during import.
- Connections to modern REALITY servers are no longer silently rejected because
  the client advertised the legacy `1.8.2` compatibility version.

## [0.2.41-dev.15] — 2026-09-19

### Added

- Windows and Android now classify common selector, REALITY, encryption, TLS,
  DNS, authentication, reset, unreachable-network, timeout, and TUN failures
  into privacy-safe diagnostics without exposing raw subscription data.
- REALITY validation accepts canonical 43-character Xray base64url public keys
  and enforces the official eight-byte short-id limit.

### Fixed

- Switching a server now activates the new selector before closing existing
  sessions, so long-lived HTTP/2, QUIC, and push connections cannot continue
  through the previously selected node.
- Failed selector changes restore both the active profile and the saved choice;
  Android no longer hides a native failure or presents a rejected node as
  selected.
- Android resets a saved node that disappeared from refreshed subscriptions to
  `SLAVE-AUTO` before starting the native core.
- REALITY links requesting X25519/ML-KEM force the compatible `chrome` uTLS
  fingerprint even when a global rotation setting requested another profile.
- Server selection now works before connection, disables desktop autobalancing
  when a manual node is chosen, and distinguishes the saved choice from the node
  currently carrying traffic. A single visible Auto action is available on the
  dashboard and full server list.
- The unfinished Xray placeholder is no longer offered as a selectable engine;
  stale saved Xray choices recover to Mihomo instead of failing every startup.

## [0.2.41-dev.14] — 2026-09-14

### Added

- Dev validation build for Windows and Android, including unified routing/DNS
  configuration, durable Android subscriptions, native Android node latency,
  deterministic source priority, and hardened update handling.
- Markdown-escaped VLESS Reality links can be pasted directly or through the
  subscription-URL flow. Reality `spx` is preserved and `pqv` enables Mihomo's
  hybrid X25519/ML-KEM handshake support.
- Release workflows validate immutable tag checkout, production Android
  signing, Windows Authenticode signatures, prepared notes, and version
  consistency before publication.

### Fixed

- A removed saved Windows node now falls back to AUTO and persists that recovery
  only after Mihomo accepts the profile, preventing repeated
  `Selector update error: proxy not exist` failures during mode changes.
- Release builds can no longer attach Windows artifacts from an unrelated branch
  or silently attach an unsigned debug Android APK to a requested release tag.
- Repository lint now performs real JavaScript/TypeScript analysis and fails on
  warnings instead of reporting an empty Turbo task as successful.

## [0.2.41-dev.13] — 2026-09-13

### Changed

- Connection quality now shows staged progress while the first VPN/DNS checks
  settle instead of displaying a premature no-internet result.
- Android subscription data uses local WebView storage as the durable primary
  copy and Capacitor Preferences as a recoverable native mirror.
- A manually dispatched Android release build now checks out the requested tag
  and derives both application versions from it before producing an APK.
- The Android “What’s new” dialog now requires an exact release version match,
  so an unpublished dev build cannot display notes from an older prerelease.
- Windows settings now use the shared `@slave-vpn/core` `SettingsStore` through
  a platform `StorageAdapter`, while preserving the existing flat
  `userData/settings.json` format. All settings mutations are awaited and
  concurrent writes are serialised to prevent stale snapshots from winning.
- Android now compiles the selected shared DNS preset, IPv4/IPv6 strategy and
  advanced resolver/rule/prefetch settings instead of always using one fixed
  mobile DNS profile. Built-in profiles retain Android node anti-loop, RU-direct
  and TCP/443 DoH hardening.
- Advanced DNS controls are available on both Windows and Android; switching a
  preset preserves the user's custom DNS overlays.
- Android node latency now uses Mihomo's native URLTest through the selected
  proxy instead of timing a direct HTTPS request to the server endpoint.
- Subscription order is now an explicit priority: the top enabled source wins
  when identical nodes are deduplicated, and sources can be moved with up/down
  controls on desktop and Android.
- Windows Mihomo core updated from `v1.19.27` to `v1.19.30` (`ac017cd`).
- Android `clashbox.aar` updated to the same Mihomo `v1.19.30` source and rebuilt reproducibly with Go `1.26.6`; independent clean checkouts now produce the pinned artifact SHA-256.
- Engine downloads now verify the pinned release-archive and extracted-binary SHA-256 before replacing an installed core.
- Windows CI now validates generated Windows and Android configurations with the pinned real core via `mihomo -t`, covering VLESS Encryption/ML-KEM, Reality/Vision, Hysteria2, TUIC, TUN/gVisor, fake-IP and Android routing/DNS modes.

### Fixed

- Android repairs a corrupt or temporarily unavailable subscription index from
  its native mirror and preserves last-known-good nodes during transient fetch,
  TLS, DNS, or parser failures.
- Subscription mutations wait for ordered mirror writes, closing the restart
  window in which a newly added source could appear to disappear.
- Equivalent subscription sources and compatibility sources no longer produce
  duplicate server rows; source priority remains deterministic.
- Windows recovery, DNS startup checks, IPC diagnostics, saved-node fallback,
  and TUN restart handling are stabilised for the dev channel.
- Settings persistence is now resilient to older supported Android WebViews
  without `structuredClone`; unknown persisted DNS presets safely use the
  `secure` profile rather than aborting VPN compilation.
- Runtime profile/DNS/routing composition now uses an immutable acknowledged
  settings snapshot, preventing a later optimistic edit from reaching the
  engine before it is persisted.
- Android settings smoke checks refuse configured or active test targets, so
  diagnostics cannot overwrite an existing subscription or VPN settings.
- Windows lifecycle fixes packaged locally as `0.2.41-dev.11`: serialize engine
  mutations, skip semantically identical profiles, retain manual/AUTO intent,
  and restore the previous configuration after failed updates.
- Windows recovery now has one owner and respects explicit disconnects;
  process termination must be confirmed before restarting. Subscription
  refreshes preserve last-good data and discard stale asynchronous results.

- IPv6 DNS strategies now enable Mihomo globally as well as inside its DNS
  section; legacy Android config callers safely fall back to the secure IPv4
  profile when the newly persisted DNS fields are absent.
- Repeated cabinet login, deep-link delivery, onboarding, or manual import no
  longer creates duplicate subscriptions. Existing duplicates are collapsed
  automatically on first load without exposing stored subscription inputs.
- Android no longer reports failed TLS handshakes or VPN-routed connection time
  as implausibly high node latency; unavailable URLTest results are shown as `—`.
- Windows binary setup no longer requires a separately installed `unzip`; it falls back to the system `tar` implementation available on Windows and GitHub runners.
- A stale `mihomo.exe` is no longer silently accepted after the pinned engine version changes.
- Android now loads the gomobile `libgojni.so` and supplies its application context before the first Mihomo call, preventing the VPN service crash observed only on a physical device.
- The onboarding “Skip” action now persists explicit guest access instead of being immediately redirected back by the protected-route guard.
- Debug builds can use an optional application-ID suffix for side-by-side device testing without deleting differently signed production-app data.
- The cross-platform Gradle launcher now preserves dotted `-P` values such as Android `versionName` on Windows.
- Android process recovery now handles `START_STICKY` null intents, restores the cached tunnel on a cold app launch, persists kill-switch state, and respects an explicit user disconnect.
- Android Kill Switch now closes an unclaimed duplicated TUN descriptor after Mihomo parse failures and retries from the last known-good native config without requiring blocked DNS.
- Android now handles the protected OS `VpnService` Always-on start action without a boot-time `isAlwaysOn`/`prepare` race and restores the cached tunnel after reboot even when the separate in-app auto-connect preference is disabled.

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

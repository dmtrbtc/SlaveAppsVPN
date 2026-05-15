# Changelog

Все значимые изменения в этом проекте документируются здесь.

Формат основан на [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Проект следует [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.6.0-internal-preview] — 2026-05-15 · app v0.2.0

### Added — Iteration 6: UI Foundation + Runtime Intelligence

**UI Layer (7 screens)**
- Login (email + Telegram deep-link flow)
- Dashboard: FSM-driven connection orb, traffic stats, connection status
- Servers: server list (stub — real data requires subscription)
- Routing: rule management UI
- DNS: profile selector
- Diagnostics: system info + process logs + runtime event timeline
- Settings: full settings panel

**Runtime Intelligence Layer**
- Connection health monitoring: 6-metric weighted scoring (process/API/connectivity/DNS/TUN/traffic)
- Health state machine: `healthy | degraded | dns_failure | tunnel_unstable | provider_unreachable | offline`
- `ConnectionOrb` + `ConnectionQualityBadge`: live health visualization, degraded indicator dot, reduced-motion support
- Smart reconnect on system wake via `powerMonitor.resume`
- Typed runtime event bus with severity levels (debug/info/warning/error/critical)
- Diagnostics event timeline: ring buffer, newest-first, 200 events max
- Global `uncaughtException`/`unhandledRejection` handlers in main process

**Provider Ecosystem**
- `PROVIDER_GET_MANIFEST` + `PROVIDER_GET_CAPABILITIES` IPC channels
- `useProviderManifest()`, `useProviderCapabilities()`, `useFeatureAvailable()` hooks
- `useFeatureFlag(flag: AppFeatureFlag)` for app-level feature gating

**Window Controls**
- `controls.minimize/maximize/close` bridge namespace + IPC handlers
- TitleBar fully wired

### Fixed — TypeScript strict mode (`exactOptionalPropertyTypes`) pre-existing violations
- `packages/shared`, `packages/api`, `packages/routing`, `packages/localization`
- `packages/provider-remnawave`, `packages/runtime`
- `apps/windows`: SettingsStore, RuntimeServiceImpl, ConnectionOrb, LoginPage, vpn.store

---

## [0.5.0] — 2026-05-15

### Added — Iteration 5: Provider Abstraction + Routing + DNS

**Provider System**
- `packages/provider` — чистые интерфейсы: VPNProvider, AuthProvider, SubscriptionProvider, ConfigSource, ProviderCapabilities
- `packages/provider` — ProviderManifest, ProviderRegistry (foundation для multi-provider)
- `packages/provider-remnawave` — полная реализация RemnawaveBedolagaProvider
- RemnawaveAuthProvider: Email + Telegram (deep-link flow) авторизация
- RemnawaveSubscriptionProvider: getSubscription, getDevices, removeDevice
- RemnawaveConfigSource: fetchYaml() через HTTPS с subscription URL

**Routing Engine**
- `packages/routing` — engine-neutral DSL (domain/geoip/geosite/process/port/ip_cidr)
- RoutingPolicy с раздельными категориями правил (processRules/userRules/providerRules/geoRules)
- Priority bands: 0-999 / 1000-1999 / 2000-2999 / 3000-3999
- PolicyValidator — валидация дублей, пустых значений, выход за priority band
- PolicyNormalizer — конвертация GeoRule → RoutingRule, merge + сортировка
- PolicyOptimizer — дедупликация, удаление избыточных domain rules
- RoutingPipeline — strict/lenient mode
- MihomoRuleCompiler — полное DSL → Mihomo rules[] с exhaustiveness guard
- RemoteRuleProvider: SHA256 checksum + atomic write (tmp→rename) + rollback
- CacheRuleProvider: last-known-good на диске
- BundledRuleProvider: статические правила
- 60+ bundled Russia bypass rules (bypass-rules.ts): YouTube, Discord, Twitter/X, Instagram, Reddit, AI services, Patreon, Twitch, Spotify, LinkedIn, Signal и другие

**DNS Subsystem**
- `packages/dns` — DnsProfile, DnsResolver (DoH/DoT/UDP/TCP)
- DnsProfilePresets: `secure` (fake-ip + DoH H3), `balanced`, `minimal`
- DEFAULT_FAKE_IP_FILTER — 50+ доменов (local, Windows services, NTP, Telegram, Apple, Android)
- MihomoDnsCompiler — компиляция в Mihomo `dns:` секцию
- DnsManager + DnsValidator
- LeakPreventionConfig с fallback-filter по GeoIP

**Config Generation**
- ConfigGenerationContext: опциональные `routingPolicy` и `dnsProfile`
- При наличии routingPolicy — использует MihomoRuleCompiler
- При наличии dnsProfile — использует MihomoDnsCompiler
- Backward-compatible: legacy VPNMode-based generation если поля не переданы

**Bootstrap**
- Полностью переписан через provider abstraction
- Единственное место где используется provider-remnawave
- services.register() только через interfaces
- Async shutdown с event.preventDefault() + app.exit(0)

---

## [0.4.0] — 2026-04-01

### Added — Iteration 4: Runtime Foundation

- `packages/config` — SubscriptionParser (js-yaml), ConfigGenerator
- GeneratorSettings: tunEnabled, tunStack, fakeIpEnabled, dnsOverHttps, fallbackDns, mixedPort
- `packages/runtime` — VPNEngine interface, RuntimeStateMachine
- MihomoEngine: FSM (idle→starting→running→crashed→reconnecting→error)
- RuntimeManager: экспоненциальный backoff (1s/2s/4s, max 30s, max 3 tries)
- HealthMonitor: 6 проверок (process alive, API ping, HTTP proxy, DNS resolve, traffic, TUN)
- TrafficMonitor: накопительная статистика, bytes/sec
- WindowsMihomoEngine + TunHooks (проверка wintun.dll)
- createWindowsEngineConfig: binaryPath, workingDir, apiPort
- RuntimeServiceImpl: маппинг RuntimeState → VPNConnectionState
- diagnostics.handler.ts: getEngineVersion()
- Async shutdown корректно через app.exit(0)

---

## [0.3.0] — 2026-03-01

### Added — Iteration 3: Subscription & State

- SubscriptionRepository (SQLite)
- UserRepository (SQLite)
- Periodic subscription refresh
- `packages/state-sync` — main↔renderer state синхронизация
- Tray icon интеграция
- SubscriptionService с кешированием и refresh

---

## [0.2.0] — 2026-02-01

### Added — Iteration 2: API & Auth

- `packages/api` — Cabinet API HTTP-клиент
- AuthApiService: loginEmail, loginTelegram, refresh, logout, getMe
- SubscriptionApiService: getSubscription, getDevices, removeDevice, getConnectionLink
- TelegramAuthFlow: deep-link flow с polling
- ElectronTokenStorage: OS keychain + in-memory
- JWT interceptor с auto-refresh при 401
- Zod-схемы для всех API-ответов

---

## [0.1.0] — 2026-01-15

### Added — Iteration 1: Foundation

- pnpm workspaces + Turborepo
- TypeScript 5.7 strict конфигурация (`tooling/tsconfig`)
- `packages/shared` — общие типы: VPNMode, VPNConnectionState, IpcChannel, etc.
- `packages/localization` — i18n foundation
- Electron 33 приложение (apps/windows)
- IPC router с Zod-валидацией входных данных
- contextBridge preload: минимальная surface area
- contextIsolation: true, nodeIntegration: false
- CSP в index.html
- electron-vite + Vite HMR для renderer
- Tailwind CSS foundation
- pino логирование

---

## Versioning Strategy

| Версия | Значение |
|---|---|
| MAJOR (1.x.x) | Первый публичный релиз |
| MINOR (0.x.0) | Новая iteration / значимая фича |
| PATCH (0.0.x) | Bug fixes, hotfixes |

Pre-release:
- `0.6.0-alpha.1` — ранняя UI версия
- `0.6.0-beta.1` — тестирование UI
- `0.6.0-rc.1` — release candidate

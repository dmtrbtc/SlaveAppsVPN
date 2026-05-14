# Roadmap

## Завершённые итерации

### ✅ Iteration 1 — Foundation
- Monorepo setup (pnpm workspaces + Turborepo)
- TypeScript strict config
- Базовые пакеты: `shared`, `api`, `localization`, `state-sync`
- Electron-приложение (apps/windows) с базовой структурой
- IPC-система с Zod-валидацией

### ✅ Iteration 2 — API & Auth
- Cabinet API client (`packages/api`)
- AuthService (Email + Telegram авторизация)
- TelegramAuthFlow (deep-link flow)
- TokenStorage (Electron SecureStorage)
- JWT-интерцептор с auto-refresh
- Zod-схемы для всех API-ответов

### ✅ Iteration 3 — Subscription & State
- SubscriptionService с кешированием
- UserRepository / SubscriptionRepository (SQLite)
- Periodic refresh
- state-sync пакет (main ↔ renderer синхронизация)
- Tray интеграция

### ✅ Iteration 4 — Runtime Foundation
- `packages/config` — SubscriptionParser + ConfigGenerator
- `packages/runtime` — VPNEngine interface, MihomoEngine, RuntimeManager
- HealthMonitor (6 проверок), TrafficMonitor
- RuntimeStateMachine (idle/starting/running/crashed/reconnecting/error)
- Экспоненциальный backoff при reconnect
- WindowsMihomoEngine + TunHooks (wintun)
- Bootstrap интеграция

### ✅ Iteration 5 — Provider Abstraction + Routing + DNS
- Provider abstraction: `packages/provider` (interfaces) + `packages/provider-remnawave`
- VPNProvider, AuthProvider, SubscriptionProvider, ConfigSource
- RemnawaveBedolagaProvider как первый провайдер
- `packages/routing` — engine-neutral DSL, pipeline (validate→normalize→optimize), MihomoRuleCompiler
- 60+ bundled Russia bypass rules (bypass-rules.ts)
- RemoteRuleProvider с SHA256 checksum + atomic write + rollback
- `packages/dns` — DnsProfile, DnsProfilePresets (secure/balanced/minimal), MihomoDnsCompiler
- Fake-IP filter list (70+ записей)
- Split tunnel abstraction (platform-neutral SplitTunnelTarget)
- ConfigGenerator обновлён: поддержка routingPolicy + dnsProfile

---

## В разработке

### 🔧 Iteration 6 — UI Layer

**Экраны:**
- [ ] Dashboard — статус подключения, трафик (upload/download), сервер
- [ ] Login — Email + Telegram авторизация
- [ ] Server Selection — список серверов с латентностью
- [ ] Routing Mode Switcher — full / bypass / split / custom
- [ ] Subscription Info — план, устройства, срок действия
- [ ] Diagnostics — версии, логи, проверка подключения
- [ ] Settings — режим VPN, DNS профиль, автозапуск

**Компоненты:**
- [ ] ConnectionButton (connect/disconnect/connecting)
- [ ] TrafficBadge (upload/download speed)
- [ ] ServerCard
- [ ] ModeSelector (tabbed)
- [ ] NotificationSystem (toast)

**Технические задачи:**
- [ ] Tailwind theme (dark + light)
- [ ] React Query для data fetching через IPC
- [ ] Animations (Framer Motion)

---

### 📋 Iteration 7 — Advanced Features

**Routing:**
- [ ] Split tunnel UI — список приложений (Windows), toggle per-app
- [ ] Custom rules editor — добавление domain/IP правил вручную
- [ ] Remote rules update — ручное обновление + auto-update scheduler
- [ ] Import/export routing config

**DNS:**
- [ ] DNS preset switcher в UI
- [ ] Custom DNS resolver input
- [ ] DNS leak test прямо из приложения

**Diagnostics:**
- [ ] Ping/latency test для каждого сервера
- [ ] Connection log viewer
- [ ] Export diagnostic report
- [ ] Speed test

**Platform:**
- [ ] Auto-launch при старте Windows
- [ ] Global kill-switch (блокировка трафика при разрыве VPN)
- [ ] Protocol selector per-server

---

### 📋 Iteration 8 — Production Hardening

- [ ] Auto-updater (electron-updater, delta updates)
- [ ] NSIS installer (Windows)
- [ ] Code signing (EV certificate)
- [ ] Crash reporter (Sentry)
- [ ] Crash recovery (watchdog)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Release pipeline (draft → test → publish)
- [ ] Telemetry (opt-in, anonymous)
- [ ] Memory leak profiling
- [ ] Performance benchmarks
- [ ] Electron security audit

---

## Будущее

### 🌐 Multi-Provider Ecosystem

- [ ] Provider marketplace concept
- [ ] Provider selection UI (если несколько провайдеров)
- [ ] Per-server provider routing
- [ ] Outline Server provider
- [ ] Custom VLESS/VMess URL provider
- [ ] WireGuard provider

### 📱 Android

- [ ] Android app (Kotlin + Jetpack Compose)
- [ ] Mihomo или sing-box как VPN engine (ARM binary)
- [ ] Shared routing DSL через Kotlin компилятор
- [ ] VPNService integration (Android API)
- [ ] RemnawaveBedolagaProvider для Android
- [ ] Material You дизайн

### 🍎 iOS

- [ ] iOS app (Swift + SwiftUI)
- [ ] Network Extension framework
- [ ] sing-box как engine
- [ ] На основе того же VPNProvider интерфейса

### 🔧 Future Engines

- [ ] sing-box компилятор (`SingBoxRuleCompiler`, `SingBoxDnsCompiler`)
- [ ] xray-core компилятор
- [ ] Параллельный запуск движков (A/B testing)

### 🏷️ White-Label

- [ ] Брендирование через конфиг (имя, цвета, логотип)
- [ ] Кастомный провайдер при сборке
- [ ] OEM-сборки из одного кодовой базы

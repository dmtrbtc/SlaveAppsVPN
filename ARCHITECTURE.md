# Архитектура SLAVE VPN

## Принципы

1. **Provider-agnostic** — платформа не зависит от конкретного VPN-бэкенда
2. **Engine-neutral** — routing/dns DSL компилируется под любой движок
3. **Platform-neutral** — split tunneling работает на Windows/Android/iOS через единый интерфейс
4. **Dependency direction** — зависимости строго однонаправленные, no circular deps
5. **IPC boundary** — renderer никогда не получает секреты (токены, subscription URL)

---

## Слои архитектуры

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 0: Renderer (React, Tailwind)                        │
│           packages/state-sync, packages/localization        │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: IPC Boundary                                      │
│           apps/windows/src/main/ipc/                        │
│           Zod-validated schemas, no raw objects across IPC  │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Services (apps/windows/src/main/services/)        │
│           AuthService, SubscriptionService, RuntimeService  │
│           UserRepository, SubscriptionRepository            │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Provider Abstraction (packages/provider)          │
│           VPNProvider, AuthProvider, SubscriptionProvider   │
│           ConfigSource, ProviderCapabilities                │
├──────────────────────────┬──────────────────────────────────┤
│  Layer 4a: Routing       │  Layer 4b: DNS                  │
│  packages/routing        │  packages/dns                    │
│  DSL → Pipeline →        │  DnsProfile → DnsCompiler →     │
│  Compiler → YAML rules   │  Mihomo dns: section            │
├──────────────────────────┴──────────────────────────────────┤
│  Layer 5: Config Generation (packages/config)               │
│           generateMihomoConfig() — собирает YAML целиком    │
├─────────────────────────────────────────────────────────────┤
│  Layer 6: Runtime (packages/runtime)                        │
│           RuntimeManager, MihomoEngine, HealthMonitor       │
│           TrafficMonitor, RuntimeStateMachine               │
├─────────────────────────────────────────────────────────────┤
│  Layer 7: External Process                                  │
│           Mihomo binary (сторонний, не в репозитории)       │
│           Управляется через REST API (127.0.0.1:9090)       │
└─────────────────────────────────────────────────────────────┘
```

---

## Граф зависимостей пакетов

```
shared
  └── api
  └── localization
  └── state-sync
  └── routing          ← только shared
  └── dns              ← только shared
  └── config           ← routing + dns + shared
  └── provider         ← (interfaces only, без зависимостей)
  └── provider-remnawave ← api + provider + shared
  └── runtime          ← config + shared

apps/windows ← api + config + provider + provider-remnawave
              + runtime + shared + state-sync + localization
```

**Запрещённые зависимости:**

| Из | В | Причина |
|---|---|---|
| `routing` | `electron` / `ipc` / `ui` | Engine-neutral слой |
| `dns` | `provider` | DNS не знает о провайдерах |
| `runtime` | `renderer` | Process boundary |
| `provider-remnawave` | `apps/windows` | Направление зависимостей |
| `config` | `apps/windows` | Config генерирует, не знает о UI |
| любой пакет | `node_modules` напрямую из renderer | Только через preload/IPC |

---

## Provider Architecture

### VPNProvider интерфейс

```typescript
interface VPNProvider {
  readonly id: string
  readonly displayName: string
  readonly capabilities: ProviderCapabilities
  readonly auth: AuthProvider
  readonly subscription: SubscriptionProvider
  getConfigSource(): ConfigSource
}
```

### ProviderCapabilities

UI адаптируется автоматически по capabilities:

```typescript
interface ProviderCapabilities {
  telegramAuth: boolean
  emailAuth: boolean
  payments: boolean
  multiDevice: boolean
  serverSelection: boolean
  trialAvailable: boolean
}
```

### ConfigSource

Ключевая абстракция: подписочный YAML получается через `ConfigSource`, не напрямую через API.
Subscription URL **никогда не передаётся в renderer**.

```typescript
interface ConfigSource {
  fetchYaml(): Promise<string>
}
```

### Текущие реализации

```
packages/provider-remnawave/
├── auth/RemnawaveAuthProvider.ts      ← loginEmail, loginTelegram, TelegramFlow
├── subscription/RemnawaveSubscriptionProvider.ts
├── subscription/RemnawaveConfigSource.ts  ← getConnectionLink() + https fetch
└── RemnawaveBedolagaProvider.ts       ← точка входа
```

### Добавление нового провайдера

1. Создать `packages/provider-<name>/`
2. Реализовать `VPNProvider` + `AuthProvider` + `SubscriptionProvider` + `ConfigSource`
3. Зарегистрировать в `bootstrap.ts` (или через настройки)

---

## Routing Engine

### DSL типы

```typescript
type RuleTargetType =
  | 'domain'         // точное совпадение домена
  | 'domain_suffix'  // домен + поддомены
  | 'domain_keyword' // ключевое слово в домене
  | 'ip_cidr'        // IP-диапазон
  | 'geoip'          // GeoIP (страна)
  | 'geosite'        // Geo site database
  | 'process_name'   // имя процесса (exe на Windows)
  | 'port'           // порт назначения

type RuleAction = 'proxy' | 'direct' | 'reject'
```

### Priority bands

| Категория | Диапазон | Описание |
|---|---|---|
| processRules | 0 – 999 | Маршрутизация по приложениям |
| userRules | 1000 – 1999 | Пользовательские правила (private CIDRs) |
| providerRules | 2000 – 2999 | Правила провайдера (bundled bypass) |
| geoRules | 3000 – 3999 | GeoIP/GeoSite правила |

### Pipeline

```
RoutingPolicy
    │
    ├── PolicyValidator    ← duplicate IDs, empty values, priority band warnings
    │
    ├── PolicyNormalizer   ← GeoRule[] → RoutingRule[], merge all, sort by priority
    │
    └── PolicyOptimizer    ← dedup exact rules, remove domain rules shadowed by suffix
                                │
                           NormalizedPolicy
                                │
                       MihomoRuleCompiler
                       (options: { proxyGroupName })
                                │
                           string[]  ← Mihomo YAML rules[]
```

### Режимы маршрутизации

**full** — `defaultAction: 'proxy'`, весь трафик через VPN  
**bypass** — `defaultAction: 'direct'`, только blocked → proxy (Russian bypass model)  
**split** — `defaultAction: 'direct'`, выбранные процессы → proxy  
**custom** — произвольная конфигурация  

### Russia Bypass Model

В отличие от China bypass (CN → direct, rest → proxy), Россия работает наоборот:
- `defaultAction: 'direct'` — большинство трафика идёт напрямую
- Заблокированные ресурсы (YouTube, Discord, Twitter, Instagram, AI-сервисы) → proxy

60+ доменных правил из `packages/routing/src/data/bypass-rules.ts`.

### Rule Providers

| Тип | Класс | Описание |
|---|---|---|
| `bundled` | `BundledRuleProvider` | Статические правила, поставляются с приложением |
| `remote` | `RemoteRuleProvider` | Загрузка по URL, SHA256 checksum, atomic write, rollback |
| `cache` | `CacheRuleProvider` | Последнее успешное состояние на диске (last-known-good) |

**RemoteRuleProvider flow:**
```
fetch URL → verify SHA256 → atomic write (tmp → rename) → update cache
                         ↓ (при ошибке)
                    rollback to CacheRuleProvider
```

### Добавление нового компилятора

1. Реализовать `RuleCompiler<TOptions>` из `packages/routing/src/compiler/RuleCompiler.ts`
2. Метод `compile(policy: NormalizedPolicy, options: TOptions): CompiledOutput`
3. Зарегистрировать в `RoutingManager`

Пример: `SingBoxRuleCompiler`, `XrayRuleCompiler`.

---

## DNS Subsystem

### DnsProfile

```typescript
interface DnsProfile {
  mode: 'fake-ip' | 'redir-host' | 'normal'
  nameservers: DnsResolver[]
  fallbackNameservers?: DnsResolver[]
  bootstrapNameservers?: DnsResolver[]
  fakeIp: FakeIpConfig
  leakPrevention: LeakPreventionConfig
  ipv6: IPv6Config
  sniffing: SniffingConfig
}
```

### Пресеты

| Пресет | Mode | DNS | Leak prevention |
|---|---|---|---|
| `secure` | fake-ip | DoH (Google + Cloudflare H3) | Полная |
| `balanced` | fake-ip | DoH + UDP mix | Средняя |
| `minimal` | redir-host | UDP | Нет |

### Fake-IP Filter

`packages/dns/src/profiles/FakeIpFilter.ts` — список доменов, исключённых из fake-ip:
- `*.local`, `*.lan`, `*.localdomain`
- Windows services (WSUS, activation, NCSI)
- NTP серверы
- Telegram (для нативного клиента)
- Apple push / iCloud

### MihomoDnsCompiler

Компилирует `DnsProfile` → Mihomo `dns:` секцию YAML.
Поддерживает DoH с H3 (`#h3=true` суффикс), DoT (`tls://`), fallback-filter с GeoIP кодом.

---

## Runtime Layer

### MihomoEngine FSM

```
idle ──start()──→ starting ──ready──→ running
  ↑                                      │
  │ restart()                      crashed/stop()
  │                                      ↓
error ←──max retries──── reconnecting ←──┘
  │
  └──restart()──→ idle ──start()──→ ...
```

### RuntimeManager

- Управляет `MihomoEngine` через `VPNEngine` интерфейс
- Экспоненциальный backoff при переподключении: 1s → 2s → 4s (max 30s)
- Максимум 3 попытки переподключения (`RECONNECT_ATTEMPTS = 3`)
- После исчерпания — переход в состояние `error`, ручное переподключение

### HealthMonitor

6 проверок каждые N секунд:
1. `isProcessAlive()` — callback от ProcessManager
2. `api.isAlive()` — ping Mihomo REST API
3. HTTP proxy connectivity — запрос через mixed-port
4. `dns.resolve4('dns.google')` — DNS резолюция
5. Traffic activity window — был ли трафик за последние N секунд
6. `tunHooks.checkTunAvailability()` — наличие wintun.dll (Windows)

### Windows-специфичный слой

```
apps/windows/src/main/runtime/
├── WindowsMihomoEngine.ts   ← TunHooks: проверка wintun.dll
└── (createWindowsEngineConfig — binaryPath, workingDir, apiPort)

packages/runtime/src/mihomo/ ← platform-neutral
├── MihomoEngine.ts
├── HealthMonitor.ts
├── TrafficMonitor.ts
└── ProcessManager.ts
```

---

## Split Tunneling

Platform-neutral модель:

```typescript
interface SplitTunnelTarget {
  platform: 'windows' | 'android' | 'ios' | 'macos' | 'linux'
  identifier: string     // exe на Windows, package name на Android, bundle ID на iOS
  displayName: string
  metadata?: Record<string, string>
}
```

На Windows `identifier` = имя процесса (например `chrome.exe`).  
На Android = `com.google.android.youtube`.  
Один и тот же интерфейс — разные платформы.

---

## IPC Security Boundary

```
Renderer               Main Process
   │                        │
   │── ipcRenderer.invoke ──→│
   │                    Zod.parse(schema)
   │                        │
   │                   Service.method()
   │                        │
   │←── sanitized result ───│
   │    (no tokens, no URLs) │
```

**Правила:**
- Subscription URL никогда не пересекает IPC
- Access token никогда не пересекает IPC
- Renderer получает только sanitized данные (PublicUser, SubscriptionInfo без URL)
- Все входные данные от renderer проходят Zod-валидацию

---

## Будущие движки

Система спроектирована для поддержки нескольких VPN-движков:

| Движок | Статус | Компилятор |
|---|---|---|
| **Mihomo** | ✅ Реализован | `MihomoRuleCompiler`, `MihomoDnsCompiler` |
| **sing-box** | 📋 Planned | `SingBoxRuleCompiler` |
| **xray-core** | 📋 Planned | `XrayRuleCompiler` |
| **WireGuard** | 📋 Planned | нет routing DSL (L3 tunnel) |

Новый движок = новый `VPNEngine` impl + новый `RuleCompiler<T>` + новый `DnsCompiler`.

---

## Android Architecture (Future)

```
Android App (Kotlin/Compose)
       │
       ├── VPNService (Android API)
       │       └── sing-box или Mihomo (ARM binary)
       │
       └── Shared packages (Kotlin Multiplatform или отдельный Node bridge)
           ├── routing/        ← тот же DSL, другой компилятор
           └── dns/            ← те же профили, другой компилятор
```

Routing DSL и DNS profiles платформо-нейтральны и могут быть переиспользованы на Android/iOS через отдельные компиляторы.

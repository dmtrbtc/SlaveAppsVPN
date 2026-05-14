# SLAVE VPN

**Производственная платформа VPN-клиентов с абстракцией провайдера, движком маршрутизации и подсистемой DNS**

> Статус: **Early Production Foundation** — архитектурное ядро завершено, UI в разработке.

---

## Что это такое

SLAVE VPN — это **провайдеро-нейтральная VPN-платформа** для Desktop (Windows, macOS, Linux) и в будущем Mobile (Android, iOS). Это не просто клиент под конкретный бэкенд — это расширяемая архитектура, в которую любой VPN-провайдер может быть интегрирован через стандартный интерфейс `VPNProvider`.

Первый интегрированный провайдер: **Remnawave / Bedolaga** (subscription-based, Telegram auth).

---

## Ключевые возможности

| Возможность | Статус |
|---|---|
| Provider-agnostic архитектура | ✅ |
| Mihomo runtime (VLESS, VMess, Trojan, ShadowSocks) | ✅ |
| Движок маршрутизации (DSL → pipeline → compiler) | ✅ |
| DNS-подсистема (DoH/DoT, fake-ip, защита от утечек) | ✅ |
| Split Tunneling (process-level) | ✅ |
| Bundled Russia-bypass rules (YouTube, Discord и др.) | ✅ |
| Remote rule updates с rollback | ✅ |
| Electron TUN-режим (wintun) | ✅ |
| IPC с Zod-валидацией | ✅ |
| Telegram Auth + Email Auth | ✅ |
| UI Dashboard | 🔧 Iteration 6 |
| Android / iOS | 📋 Planned |

---

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│                    Renderer (React)                  │
├─────────────────────────────────────────────────────┤
│              IPC Layer (Zod-validated)               │
├──────────────┬──────────────┬───────────────────────┤
│  AuthService │  SubService  │    RuntimeService      │
├──────────────┴──────────────┴───────────────────────┤
│              VPNProvider (abstraction)               │
│  ┌──────────────────────────────────────────────┐   │
│  │        RemnawaveBedolagaProvider              │   │
│  │  AuthProvider  │  SubscriptionProvider        │   │
│  │               ConfigSource                   │   │
│  └──────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────┤
│  @slave-vpn/routing    │    @slave-vpn/dns           │
│  RoutingManager        │    DnsManager               │
│  RoutingPipeline       │    DnsProfilePresets        │
│  MihomoRuleCompiler    │    MihomoDnsCompiler        │
├──────────────────────────────────────────────────────┤
│              @slave-vpn/runtime                      │
│         RuntimeManager → MihomoEngine                │
│         HealthMonitor / TrafficMonitor               │
├──────────────────────────────────────────────────────┤
│         Mihomo Process (external binary)             │
└──────────────────────────────────────────────────────┘
```

---

## Стек технологий

| Слой | Технология |
|---|---|
| Desktop shell | **Electron 33** |
| Frontend | **React 19** + Tailwind CSS |
| IPC validation | **Zod 3** |
| VPN engine | **Mihomo** (Clash Meta fork) |
| Language | **TypeScript 5.7** (strict) |
| Monorepo | **pnpm workspaces** + Turborepo |
| Build | **electron-vite** |
| Config generation | **js-yaml** |
| Logging | **pino** |

---

## Структура монорепо

```
slave-vpn/
├── apps/
│   └── windows/              # Electron-приложение
│       ├── src/main/          # Main process (Node.js)
│       │   ├── bootstrap.ts   # DI-контейнер и инициализация
│       │   ├── ipc/           # IPC-обработчики
│       │   ├── services/      # Бизнес-логика (AuthService, RuntimeService, ...)
│       │   └── runtime/       # Windows-специфичный движок
│       └── src/renderer/      # React UI
│
├── packages/
│   ├── api/                   # HTTP-клиент к Cabinet API
│   ├── config/                # Генерация конфигурации Mihomo (YAML)
│   ├── dns/                   # DNS-профили и компилятор
│   ├── localization/          # i18n
│   ├── provider/              # VPNProvider interface (contracts only)
│   ├── provider-remnawave/    # Реализация Remnawave провайдера
│   ├── routing/               # Движок маршрутизации (DSL → Mihomo rules)
│   ├── runtime/               # RuntimeManager, MihomoEngine, мониторинг
│   ├── shared/                # Общие типы и константы
│   └── state-sync/            # Electron state sync renderer↔main
│
└── tooling/
    └── tsconfig/              # Базовые TypeScript-конфиги
```

---

## Поддержка VPN-провайдеров

Платформа использует интерфейс `VPNProvider`:

```typescript
interface VPNProvider {
  id: string
  displayName: string
  capabilities: ProviderCapabilities
  auth: AuthProvider
  subscription: SubscriptionProvider
  getConfigSource(): ConfigSource
}
```

**Текущие провайдеры:**
- ✅ **RemnawaveBedolagaProvider** — Remnawave/Bedolaga backend, Telegram + Email авторизация

**Планируемые провайдеры:**
- 📋 Outline Server
- 📋 Custom VLESS/VMess URL
- 📋 WireGuard
- 📋 OpenVPN

---

## Маршрутизация

Система маршрутизации работает поверх engine-neutral DSL:

```
RoutingPolicy → PolicyValidator → PolicyNormalizer → PolicyOptimizer
                                                          ↓
                                               NormalizedPolicy
                                                          ↓
                                           MihomoRuleCompiler
                                                          ↓
                                              YAML rules[]
```

**Режимы:**
- `full` — весь трафик через VPN
- `bypass` — только заблокированные ресурсы через VPN (Russia bypass mode)
- `split` — выбранные приложения через VPN
- `custom` — пользовательская конфигурация

---

## DNS

Профили DNS: `secure` / `balanced` / `minimal`

- **secure**: fake-ip + DoH (Google, Cloudflare) + полная защита от утечек
- **balanced**: fake-ip + mix DoH/UDP
- **minimal**: redir-host + standard UDP

---

## Быстрый старт (разработка)

```bash
# Установка зависимостей
pnpm install

# Запуск в режиме разработки
pnpm dev

# Сборка всех пакетов
pnpm build

# Typecheck
pnpm typecheck
```

Подробнее: [DEVELOPMENT.md](./DEVELOPMENT.md)

---

## Документация

| Документ | Описание |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Архитектурные решения и слои |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Руководство разработчика |
| [ROADMAP.md](./ROADMAP.md) | Дорожная карта |
| [SECURITY.md](./SECURITY.md) | Модель безопасности |

---

## Лицензия

Proprietary. All rights reserved.

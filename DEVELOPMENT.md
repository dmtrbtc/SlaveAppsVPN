# Руководство разработчика

## Требования

| Инструмент | Версия |
|---|---|
| Node.js | ≥ 22.x |
| pnpm | ≥ 9.x |
| TypeScript | 5.7 (устанавливается локально) |
| Python | ≥ 3.x (для node-gyp / нативных модулей) |
| Visual Studio Build Tools | Windows (для electron rebuild) |

---

## Установка

```bash
# Клонировать репозиторий
git clone https://github.com/your-org/slave-vpn-core.git
cd slave-vpn-core

# Установить все зависимости (все пакеты monorepo)
pnpm install
```

---

## Разработка

### Запуск всего monorepo в dev-режиме

```bash
pnpm dev
```

Это запускает:
- `electron-vite dev` для `apps/windows` (Electron + Vite HMR)
- `tsc --watch` для всех packages (параллельно через Turbo)

### Запуск только Electron-приложения

```bash
# Сначала собрать зависимые packages
pnpm build --filter=!@slave-vpn/windows

# Затем запустить windows app
cd apps/windows
pnpm dev
```

### Сборка отдельного пакета

```bash
# Пример: собрать routing
pnpm build --filter=@slave-vpn/routing

# Собрать всё дерево зависимостей routing (включая deps)
pnpm build --filter=@slave-vpn/routing...

# Собрать всё
pnpm build
```

---

## Структура Main Process

```
apps/windows/src/main/
├── bootstrap.ts           # DI-контейнер, инициализация всех сервисов
├── index.ts               # Точка входа Electron
├── ipc/
│   ├── router.ts          # Регистрация всех IPC-обработчиков
│   └── handlers/
│       ├── auth.handler.ts
│       ├── subscription.handler.ts
│       ├── runtime.handler.ts
│       └── diagnostics.handler.ts
├── services/
│   ├── AuthService.ts             # Interface
│   ├── RuntimeService.ts          # Interface
│   ├── SubscriptionService.ts     # Interface
│   └── impl/
│       ├── AuthServiceImpl.ts     ← делегирует AuthProvider
│       ├── RuntimeServiceImpl.ts  ← делегирует RuntimeManager + ConfigSource
│       └── SubscriptionServiceImpl.ts
├── runtime/
│   └── WindowsMihomoEngine.ts    # TunHooks, createWindowsEngineConfig
└── repositories/
    ├── UserRepository.ts
    └── SubscriptionRepository.ts
```

---

## Bootstrap Flow

```typescript
// bootstrap.ts упрощённо:

const provider = new RemnawaveBedolagaProvider({ apiBaseUrl, tokenStorage })

const runtimeManager = new RuntimeManager()
await runtimeManager.initialize('mihomo', createWindowsEngineConfig(userDataPath, apiSecret))

const runtimeService = new RuntimeServiceImpl({
  manager: runtimeManager,
  configSource: provider.getConfigSource(),
  getSettings: () => settings.getAll()
})

services.register('auth', () => new AuthServiceImpl(provider.auth))
services.register('subscription', () => new SubscriptionServiceImpl(provider.subscription, repo))
services.register('runtime', () => runtimeService)
```

---

## Config Generation Flow

```
1. RuntimeServiceImpl.connect()
   ↓
2. configSource.fetchYaml()           ← RemnawaveConfigSource
   ↓ HTTPS request to subscription URL
3. Subscription YAML (Mihomo format)
   ↓
4. generateMihomoConfig({
     subscriptionYaml,
     routingPolicy,    ← NormalizedPolicy (опционально)
     dnsProfile,       ← DnsProfile (опционально)
     vpnMode,
     settings,
     apiPort, apiSecret
   })
   ↓
5. SubscriptionParser.parse()         ← извлечь proxies + proxy-groups
   ↓
6. MihomoRuleCompiler.compile()       ← NormalizedPolicy → string[]
   ↓
7. MihomoDnsCompiler.compile()        ← DnsProfile → dns: {}
   ↓
8. js-yaml.dump(config)               ← готовый YAML
   ↓
9. fs.writeFileSync(configPath)       ← записать в userData/mihomo/config.yaml
   ↓
10. MihomoEngine.start()              ← запустить mihomo --config configPath
```

---

## Routing System

### Создание политики маршрутизации

```typescript
import { createBypassPolicy, RoutingPipeline, MihomoRuleCompiler } from '@slave-vpn/routing'

const policy = createBypassPolicy()

const pipeline = new RoutingPipeline()
const { policy: normalized, validation } = pipeline.process(policy)

if (!validation.valid) {
  console.error(validation.errors)
}

const compiler = new MihomoRuleCompiler()
const { rules } = compiler.compile(normalized, { proxyGroupName: 'SLAVE-SELECT' })
// rules → ['DOMAIN-SUFFIX,youtube.com,SLAVE-SELECT', ...]
```

### Добавление кастомного правила

```typescript
import { createCustomPolicy } from '@slave-vpn/routing'

const policy = createCustomPolicy({
  defaultAction: 'direct',
  userRules: [
    {
      id: 'custom:work-vpn',
      target: { type: 'domain_suffix', value: 'company.internal' },
      action: 'direct',
      priority: 1100,
    }
  ]
})
```

---

## DNS System

### Применение DNS-профиля

```typescript
import { DnsManager, DnsProfilePresets, MihomoDnsCompiler } from '@slave-vpn/dns'

const manager = new DnsManager(new MihomoDnsCompiler())
manager.applyPreset('secure')

const { config } = manager.compile()
// config → объект для Mihomo dns: секции
```

---

## Debugging

### Логирование

Используется **pino** с pretty-output в dev-режиме:

```bash
# В режиме разработки логи форматируются через pino-pretty
ELECTRON_LOG_LEVEL=debug pnpm dev
```

Логи пишутся в:
- stdout (dev)
- `userData/logs/app.log` (production)

### Mihomo API

Mihomo запускается с REST API на `127.0.0.1:9090` (или настроенном порту).

```bash
# Проверить статус Mihomo
curl http://127.0.0.1:9090/version

# Посмотреть подключения
curl http://127.0.0.1:9090/connections \
  -H "Authorization: Bearer <api-secret>"

# Traffic
curl http://127.0.0.1:9090/traffic \
  -H "Authorization: Bearer <api-secret>"
```

### TypeScript проверка типов

```bash
# Проверить все пакеты
pnpm typecheck

# Проверить конкретный пакет
cd packages/routing && pnpm typecheck
```

---

## Добавление нового VPN-провайдера

1. Создать `packages/provider-<name>/`:
   ```
   src/
   ├── auth/<Name>AuthProvider.ts      # implements AuthProvider
   ├── subscription/<Name>SubscriptionProvider.ts  # implements SubscriptionProvider
   ├── subscription/<Name>ConfigSource.ts  # implements ConfigSource
   └── <Name>Provider.ts               # implements VPNProvider
   ```

2. Добавить в `packages/provider-<name>/package.json`:
   ```json
   {
     "dependencies": {
       "@slave-vpn/provider": "workspace:*",
       "@slave-vpn/shared": "workspace:*"
     }
   }
   ```

3. В `bootstrap.ts` — заменить или добавить провайдер в selection logic.

---

## Сборка для production

```bash
# Windows installer (NSIS)
cd apps/windows
pnpm dist

# Только директория (без installer)
pnpm pack
```

Mihomo binary должен быть помещён в:
```
apps/windows/resources/bin/mihomo.exe
```

Перед сборкой (не включён в репозиторий, скачивается отдельно).

---

## Переменные окружения

| Переменная | Описание | Default |
|---|---|---|
| `VITE_API_BASE_URL` | Cabinet API URL | — |
| `ELECTRON_LOG_LEVEL` | Уровень логирования | `info` |
| `MIHOMO_API_PORT` | Порт Mihomo REST API | `9090` |

`.env` файлы не коммитятся. Используйте `.env.example` как шаблон.

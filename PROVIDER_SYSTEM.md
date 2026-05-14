# Provider System

SLAVE VPN использует provider abstraction для отделения VPN-платформы от конкретных бэкендов.

---

## Концепция

```
SLAVE VPN Platform
       │
       ├── VPNProvider (interface)
       │       ├── AuthProvider
       │       ├── SubscriptionProvider
       │       └── ConfigSource
       │
       ├── RemnawaveBedolagaProvider  ← default, первый impl
       ├── OutlineProvider            ← planned
       ├── CustomUrlProvider          ← planned
       └── WireGuardProvider          ← planned
```

Приложение работает с `VPNProvider` интерфейсом. Конкретный провайдер — деталь реализации, скрытая за `bootstrap.ts`.

---

## Интерфейсы (packages/provider)

### VPNProvider

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

```typescript
interface ProviderCapabilities {
  telegramAuth: boolean      // UI показывает Telegram login button
  emailAuth: boolean         // UI показывает email/password форму
  payments: boolean          // UI показывает платёжные экраны
  multiDevice: boolean       // UI показывает список устройств
  serverSelection: boolean   // UI показывает выбор сервера
  trialAvailable: boolean    // UI показывает trial badge
}
```

UI адаптируется автоматически — провайдер объявляет что умеет, UI отображает нужные секции.

### AuthProvider

```typescript
interface AuthProvider {
  loginEmail(email: string, password: string): Promise<AuthResult>
  loginTelegram(initData: string): Promise<AuthResult>
  startTelegramDeepLinkFlow(callbacks: TelegramDeepLinkCallbacks): TelegramFlowHandle
  logout(): Promise<void>
  getMe(): Promise<User>
}
```

### SubscriptionProvider

```typescript
interface SubscriptionProvider {
  getSubscription(): Promise<SubscriptionInfo>
  getDevices(): Promise<Device[]>
  removeDevice(hwid: string): Promise<void>
  getConnectionLink(): Promise<string>  // subscription URL, ТОЛЬКО для main process
}
```

### ConfigSource

```typescript
interface ConfigSource {
  fetchYaml(): Promise<string>   // возвращает Mihomo YAML
}
```

Subscription URL **никогда** не передаётся в renderer — только `ConfigSource.fetchYaml()` результат используется для генерации конфига.

---

## ProviderManifest

Метаданные провайдера для отображения в UI и каталоге:

```typescript
interface ProviderManifest {
  id: string
  displayName: string
  description: string
  version: string
  tier: 'community' | 'verified' | 'official'
  capabilities: ProviderCapabilities
  contact?: {
    website?: string
    support?: string
    telegram?: string
  }
  logoUrl?: string
  privacyPolicyUrl?: string
  termsUrl?: string
}
```

---

## ProviderRegistry

Реестр провайдеров для динамического выбора:

```typescript
const registry = new ProviderRegistry()

// Регистрация
registry.register(remnawave.manifest, () => new RemnawaveBedolagaProvider(config))

// Активация
const provider = registry.activate('remnawave-bedolaga')

// Список доступных
const manifests = registry.listManifests()
```

---

## Первый провайдер: Remnawave / Bedolaga

**Пакет:** `packages/provider-remnawave`

```
provider-remnawave/
├── auth/
│   └── RemnawaveAuthProvider.ts       ← Email + Telegram auth
├── subscription/
│   ├── RemnawaveSubscriptionProvider.ts
│   └── RemnawaveConfigSource.ts       ← fetches subscription YAML
└── RemnawaveBedolagaProvider.ts       ← implements VPNProvider
```

**Manifest:**
```typescript
{
  id: 'remnawave-bedolaga',
  displayName: 'Remnawave',
  tier: 'official',
  capabilities: {
    telegramAuth: true,
    emailAuth: true,
    payments: true,
    multiDevice: true,
    serverSelection: true,
    trialAvailable: true
  }
}
```

---

## Написание нового провайдера

### 1. Создать пакет

```bash
mkdir packages/provider-myservice
cd packages/provider-myservice
```

### 2. package.json

```json
{
  "name": "@slave-vpn/provider-myservice",
  "version": "0.0.0",
  "private": true,
  "type": "commonjs",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "dependencies": {
    "@slave-vpn/provider": "workspace:*",
    "@slave-vpn/shared": "workspace:*"
  }
}
```

### 3. Реализовать интерфейсы

```typescript
// src/MyServiceProvider.ts
import type { VPNProvider } from '@slave-vpn/provider'

export class MyServiceProvider implements VPNProvider {
  readonly id = 'myservice'
  readonly displayName = 'My VPN Service'
  readonly capabilities = {
    telegramAuth: false,
    emailAuth: true,
    payments: false,
    multiDevice: false,
    serverSelection: true,
    trialAvailable: false,
  }
  readonly auth = new MyServiceAuthProvider()
  readonly subscription = new MyServiceSubscriptionProvider()
  getConfigSource() { return new MyServiceConfigSource() }
}
```

### 4. Зарегистрировать

```typescript
// bootstrap.ts
registry.register(
  {
    id: 'myservice',
    displayName: 'My VPN Service',
    tier: 'community',
    capabilities: provider.capabilities,
    // ...
  },
  () => new MyServiceProvider(config)
)
const provider = registry.activate('myservice')
```

---

## White-Label Mode

Для брендированной сборки:

```typescript
// Кастомный манифест при сборке
const manifest: ProviderManifest = {
  id: 'branded-vpn',
  displayName: process.env.BRAND_NAME ?? 'SLAVE VPN',
  tier: 'official',
  // ...
}
```

Одна кодовая база → разные бренды через env-переменные и provider manifest.

---

## Security Rules

1. `getConnectionLink()` — только внутри `ConfigSource.fetchYaml()`, никогда в renderer
2. Auth токены — только в main process memory + OS keychain
3. Provider implementation details — не видны renderer
4. Renderer видит только: `ProviderCapabilities` (для адаптации UI) и публичные data types

---

## Planned Providers

| ID | Тип | Статус |
|---|---|---|
| `remnawave-bedolaga` | Subscription API | ✅ Implemented |
| `outline` | Outline Server | 📋 Planned |
| `custom-vless-url` | Manual URL | 📋 Planned |
| `wireguard` | WireGuard config | 📋 Planned |
| `singbox-subscription` | sing-box subscription | 📋 Planned |

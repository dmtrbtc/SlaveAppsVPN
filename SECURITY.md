# Модель безопасности

## Принципы

1. **Renderer изолирован** — никаких секретов в renderer process
2. **IPC валидация** — все входные данные от renderer проходят Zod-схему
3. **Минимальный IPC** — только sanitized данные пересекают IPC boundary
4. **Token isolation** — access/refresh токены хранятся только в main process
5. **Subscription URL isolation** — URL подписки никогда не попадает в renderer

---

## Electron Security Model

### Context Isolation

```javascript
// apps/windows/src/preload/index.ts
contextBridge.exposeInMainWorld('api', {
  auth: { login, logout, getMe },
  // Только явно разрешённые методы
})
```

- `contextIsolation: true` — включено
- `nodeIntegration: false` — в renderer отключён доступ к Node.js
- `sandbox: true` — renderer запускается в Chromium sandbox

### Content Security Policy

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'none';
">
```

Renderer не может делать сетевые запросы напрямую — только через IPC.

---

## IPC Boundary

### Схема входящих данных (Zod)

Каждый IPC-обработчик валидирует входные данные:

```typescript
// Пример: login handler
ipcMain.handle(IpcChannel.AUTH_LOGIN_EMAIL, async (_, args) => {
  const { email, password } = LoginEmailSchema.parse(args)
  return authService.loginEmail(email, password)
})
```

**Что происходит при невалидных данных:**
- `ZodError` — обработчик возвращает ошибку, renderer получает sanitized error message
- Злонамеренные данные не проходят дальше IPC-обработчика

### Исходящие данные (sanitized)

```typescript
// PublicUser (что получает renderer) vs User (что хранится в main)
interface PublicUser {
  id: string
  email: string
  username: string
  // НЕТ: token, refreshToken, internalId
}

interface SubscriptionInfo {
  plan: string
  expiresAt: Date
  deviceCount: number
  // НЕТ: connectionLink, subscriptionUrl
}
```

---

## Token Isolation

### Хранение токенов

```
Main Process Memory
  └── ElectronTokenStorage
        ├── accessToken    ← только в памяти main process
        └── refreshToken   ← только в памяти main process

Electron SecureStorage (OS keychain)
  └── refresh token (persistent между сессиями)
```

**Tokens никогда:**
- Не отправляются в renderer
- Не логируются (pino: redact paths)
- Не попадают в IPC response
- Не пишутся в plaintext файлы

### JWT Auto-Refresh

HTTP-интерцептор в `packages/api` автоматически обновляет access token при 401.
При невалидном refresh token — `onSessionExpired()` callback → renderer получает `AUTH_EXPIRED` event.

---

## Subscription URL Protection

Subscription URL — это персональная ссылка пользователя с вшитым токеном доступа.

**Flow:**
```
RemnawaveSubscriptionProvider.getConnectionLink()
  ↓ (HTTPS GET → Cabinet API → возвращает URL)
RemnawaveConfigSource.fetchYaml()
  ↓ (HTTPS GET к subscription URL)
YAML string
  ↓
generateMihomoConfig()
  ↓
config.yaml (на диске в userData)
  ↓
MihomoEngine — читает файл
```

URL **нигде не хранится** кроме запроса-ответа. В `SubscriptionService` (renderer-facing) метода `getConnectionLink()` нет.

---

## Provider Secret Isolation

```
packages/provider-remnawave/    ← знает про Cabinet API endpoints, auth flow
packages/provider/              ← только интерфейсы
apps/windows/src/main/          ← использует через VPNProvider интерфейс

apps/windows/src/renderer/      ← НЕ ЗНАЕТ про Remnawave
```

Renderer не знает:
- Какой провайдер используется (только через capabilities)
- Какой API URL используется
- Какие HTTP-заголовки отправляются

---

## Mihomo API Security

Mihomo запускается с рандомным secret:

```typescript
const apiSecret = crypto.randomBytes(16).toString('hex')
// Генерируется при каждом запуске, не сохраняется
```

API слушает только `127.0.0.1` (loopback), не доступен снаружи.

---

## Файловая система

### userData (AppData/Roaming)

```
userData/
├── logs/          ← логи (без секретов, с redact)
├── db/            ← SQLite (User, Subscription, нет токенов)
└── mihomo/
    └── config.yaml  ← Mihomo config (содержит api-secret, не в repo)
```

`.gitignore` исключает `userData/`, `*.db`, `*.sqlite`.

### Binaries

```
apps/windows/resources/bin/mihomo.exe  ← НЕ в репозитории (gitignored)
```

Скачивается отдельно при сборке/установке.

---

## Dependency Audit

Регулярно запускать:

```bash
pnpm audit
```

Критические уязвимости в зависимостях — блокирующие.

---

## Checklist перед релизом

- [ ] `pnpm audit` — нет critical/high уязвимостей
- [ ] Electron security checklist пройден
- [ ] contextIsolation: true
- [ ] nodeIntegration: false в renderer
- [ ] CSP настроен
- [ ] Code signing (Windows EV cert)
- [ ] Все IPC-обработчики имеют Zod-валидацию
- [ ] Логи не содержат токенов (проверить pino redact config)
- [ ] `.env` файлы в .gitignore
- [ ] Mihomo binary верифицирован (SHA256 checksum)
- [ ] No plaintext secrets в коде (`grep -r "password\|secret\|token" src/`)

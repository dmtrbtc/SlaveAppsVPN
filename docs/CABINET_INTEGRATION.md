<div align="center">

# 🔌 Подключение своего личного кабинета

**Как направить SLAVE VPN на личный кабинет другого сервиса (white-label).**

</div>

> ⚠️ **Только по согласованию.** Этот код — клиент конкретной экосистемы. Если хотите
> подключить **свой** бэкенд кабинета (например другой VPN-сервис на той же панели
> bedolaga/Remnawave), **сначала согласуйте это с автором проекта** ([@dmtrbtc](https://github.com/dmtrbtc)).
> Документ описывает, что для этого технически нужно.

---

## 📑 Содержание
1. [Как это устроено](#1-как-это-устроено)
2. [Шаг 1 — сменить адрес кабинета](#2-шаг-1--сменить-адрес-кабинета)
3. [Шаг 2 — API-контракт бэкенда](#3-шаг-2--api-контракт-бэкенда)
4. [Минимальный набор эндпоинтов](#4-минимальный-набор)
5. [Брендинг](#5-брендинг)
6. [Проверка](#6-проверка)

---

## 1. Как это устроено

Приложение разговаривает с кабинетом через **один класс** — `CabinetClient`
([`packages/core/src/cabinet/CabinetClient.ts`](../packages/core/src/cabinet/CabinetClient.ts)).
Он платформо-независим (работает и на Windows, и на Android) и зависит только от
HTTP-адаптера. Чтобы подключить другой сервис, нужно:

1. **Сменить базовый адрес** API кабинета.
2. **Реализовать на своём бэкенде тот же API-контракт** (или его минимальное подмножество).

Авторизация — **JWT**: пара `access_token` / `refresh_token`, передаётся как
`Authorization: Bearer <access_token>`. Клиент сам обновляет токен по `401`.

---

## 2. Шаг 1 — сменить адрес кабинета

Адрес задаётся одной константой:

```ts
// packages/core/src/cabinet/CabinetClient.ts
export const CABINET_DEFAULT_BASE_URL = 'https://cabinet.slave-apps.online/api'
```

Замените её на адрес своего API (обязательно с суффиксом `/api`, без завершающего слэша):

```ts
export const CABINET_DEFAULT_BASE_URL = 'https://cabinet.ВАШ-ДОМЕН.com/api'
```

Затем **пересоберите** приложение:

```bash
pnpm install
pnpm --filter "./packages/**" build
pnpm --filter @slave-vpn/windows build      # web-бандл (общий для Android)
pnpm --filter @slave-vpn/windows dist        # Windows Setup/Portable
# Android APK собирается в CI (.github/workflows/android.yml)
```

> 💡 Для разработчиков: `CabinetClient` принимает `baseUrl` третьим аргументом
> конструктора — можно прокинуть его из своей конфигурации, не меняя константу.
> Точки создания клиента: `apps/windows/src/main/services/CabinetService.ts`
> (Windows) и `apps/windows/src/renderer/src/android/bridge.ts` (Android).

**Требования к серверу:**
- **HTTPS** обязателен.
- Ответы — **JSON**. Поля — `snake_case` (как ниже).
- CORS не критичен (Android ходит через нативный HTTP), но для веба настройте.

---

## 3. Шаг 2 — API-контракт бэкенда

Все пути — относительно базового адреса (`<BASE>` = `https://…/api`).
Тело запросов и ответов — JSON. `(🔒)` = требуется заголовок `Authorization: Bearer`.

### Авторизация

| Метод | Путь | Запрос | Ответ |
|---|---|---|---|
| `POST` | `/cabinet/auth/email/login` | `{ email, password }` | `200` **AuthResponse** · `401/403/422` неверные данные |
| `POST` | `/cabinet/auth/email/register/standalone` | `{ email, password, language, first_name? }` | `200 { requires_verification: bool }` · `4xx { detail }` |
| `POST` | `/cabinet/auth/email/verify` | `{ token }` | `200` **AuthResponse** |
| `POST` | `/cabinet/auth/password/forgot` | `{ email }` | `200` (всегда, без раскрытия наличия аккаунта) |
| `POST` | `/cabinet/auth/password/reset` | `{ token, password }` | `200` · ошибка `{ detail }` |
| `POST` | `/cabinet/auth/refresh` | `{ refresh_token }` | `200 { access_token, refresh_token?, expires_in? }` |
| `POST` | `/cabinet/auth/logout` (🔒) | `{}` | любой |
| `GET`  | `/cabinet/auth/me` (🔒) | — | **UserObject** |

**Вход через Telegram (опционально):**

| Метод | Путь | Запрос | Ответ |
|---|---|---|---|
| `POST` | `/cabinet/auth/deeplink/request` | `{}` | `200 { token, bot_username, expires_in }` |
| `POST` | `/cabinet/auth/deeplink/poll` | `{ token }` | `202` ждём · `200` **AuthResponse** · `400/404/410` истёк |

> Бот должен ловить `/start webauth_<token>` и подтверждать вход (приложение
> формирует ссылку `https://t.me/<bot_username>?start=webauth_<token>`).

### Подписка

| Метод | Путь | Ответ |
|---|---|---|
| `GET` | `/cabinet/subscription` (🔒) | `{ has_subscription: bool, subscription: SubscriptionObject \| null }` |
| `GET` | `/cabinet/subscription/connection-link` (🔒) | `{ subscription_url }` (или `url` / `connection_link` / `link`) |

`subscription_url` — это URL, который приложение скачает и распарсит как набор
серверов (**Clash YAML**, **sing-box JSON**, **base64 `vless://…`**). Именно он
импортируется автоматически после входа.

### Баланс, устройства, продление (опционально)

| Метод | Путь | Запрос / Ответ |
|---|---|---|
| `GET` | `/cabinet/balance` (🔒) | `{ balance_kopeks, balance_rubles }` |
| `GET` | `/cabinet/balance/transactions?page=&per_page=` (🔒) | `{ items: Transaction[], total, page, pages }` |
| `GET` | `/cabinet/subscription/devices` (🔒) | `{ devices: Device[], total, device_limit }` |
| `DELETE` | `/cabinet/subscription/devices/{hwid}` (🔒) | — |
| `GET` | `/cabinet/subscription/renewal-options` (🔒) | `RenewalOption[]` |
| `POST` | `/cabinet/subscription/renew` (🔒) | `{ period_days }` |
| `PATCH` | `/cabinet/subscription/autopay` (🔒) | `{ enabled, days_before? }` |

### Структуры

**AuthResponse**
```json
{ "access_token": "…", "refresh_token": "…", "expires_in": 900, "user": { /* UserObject */ } }
```

**UserObject**
```json
{
  "id": 123, "telegram_id": null, "username": null,
  "first_name": null, "last_name": null,
  "email": "user@example.com", "email_verified": true,
  "balance_kopeks": 0, "balance_rubles": 0,
  "referral_code": null, "language": "ru",
  "created_at": "2026-01-01T00:00:00Z", "auth_type": "email"
}
```

**SubscriptionObject**
```json
{
  "id": 1, "status": "active", "is_trial": false,
  "start_date": "…", "end_date": "…",
  "days_left": 30, "hours_left": 0, "minutes_left": 0, "time_left_display": "30 дней",
  "traffic_limit_gb": 0, "traffic_used_gb": 0, "traffic_used_percent": 0,
  "device_limit": 3, "autopay_enabled": false,
  "is_active": true, "is_expired": false, "is_limited": false,
  "tariff_name": "Базовый", "subscription_url": "https://…/sub/…"
}
```

**Transaction** — `{ id, type, amount_kopeks, amount_rubles, description?, payment_method?, is_completed, created_at }`
**Device** — `{ hwid, platform, device_model, local_name? }`
**RenewalOption** — `{ period_days, price_kopeks, price_rubles, discount_percent, original_price_kopeks? }`

---

## 4. Минимальный набор

Если нужен только **вход + авто-импорт подписки** (баланс/устройства/продление не важны —
интерфейс их корректно скрывает/деградирует), достаточно реализовать:

1. `POST /cabinet/auth/email/login` → AuthResponse
2. `POST /cabinet/auth/refresh` → новые токены
3. `GET  /cabinet/auth/me` → UserObject
4. `GET  /cabinet/subscription` → статус
5. `GET  /cabinet/subscription/connection-link` → URL подписки

Остальные эндпоинты — по желанию (кнопки баланса/продления/устройств просто не дадут данных).

---

## 5. Брендинг

- **Название, иконки** — см. [README](../README.md) (раздел брендинга) и
  `apps/windows/resources/icons` + `apps/android/brand-res`.
- **Ссылки на веб-кабинет** (кнопки «Привязать Telegram» и «Пополнить баланс»
  открывают веб-ЛК) захардкожены как `https://cabinet.slave-apps.online` в
  `apps/windows/src/renderer/src/components/cabinet/CabinetPanel.tsx`. Замените на
  свой домен веб-кабинета.

---

## 6. Проверка

1. Поднимите бэкенд по новому адресу, реализуйте контракт (хотя бы минимальный).
2. Соберите приложение с новым `CABINET_DEFAULT_BASE_URL`.
3. Онбординг → **«Аккаунт SLAVE»** → войдите по email → подписка должна
   импортироваться автоматически и появиться на вкладке «Подписки».
4. Проверьте логи (**Диагностика → Логи**) на ошибки сети/парсинга.

> Контракт выше зафиксирован по реальному коду `CabinetClient` (не по догадкам).
> Если на вашей панели поля называются иначе — приведите ответы к этим именам
> на стороне сервера (прокси/адаптер) ИЛИ обновите маппинг в `CabinetClient`
> (`mapUser` / `mapSubscription`).

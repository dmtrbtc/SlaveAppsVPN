# SLAVE VPN — Унификация архитектуры (Windows ⟷ Android)

> Статус: **принято к реализации** (2026-06-09). Канонический роадмап.
> Решение: большой Core-рефактор (P0) сначала, затем паритет по фичам,
> начиная с маршрутизации. Каждая фаза оставляет оба приложения рабочими и
> проверяется `mihomo -t` + сборкой Setup/APK.

## 1. Цель

Один и тот же функционал на Windows и Android, написанный **один раз**.
Сейчас бизнес-логика живёт в Windows main-процессе (Node-сервисы), а Android
дублирует её подмножество в рендерере или оставляет заглушками. Это причина
постоянного дрейфа паритета и того, что фиксы прилетают только на одну
платформу (свежий пример: фикс RU-обхода через сценарии починил только
Windows — Android идёт по своему `androidRouting`).

## 2. Корень проблемы

```
Сейчас:
  renderer ──IPC──► Windows main (RuntimeServiceImpl + 15 сервисов) ──► engine
  renderer ──────► android/*.ts (compile-config, aggregator, runtime-settings) ──► native plugin
                   ▲ ПАРАЛЛЕЛЬНАЯ реализация, dns/rules/routing/profiles/geo = заглушки
```

Две модели маршрутизации (`routingPolicy` vs `androidRouting`), две DNS-модели,
два стора правил, два стора настроек, два агрегатора подписок.

## 3. Целевая архитектура

```
Цель:
  renderer ──► CoreFacade (единый async-интерфейс)
                 │
                 ▼
            @slave-vpn/core  (вся бизнес-логика, платформо-независимо)
              settings · subscriptions · dns · routing · rules · geo · profiles · balancer
                 │ зависит ТОЛЬКО от интерфейсов-адаптеров
       ┌─────────┼─────────┬──────────────┐
   StorageAdapter NetworkAdapter FsAdapter EngineAdapter
       │         │          │              │
  Windows: electron-store/Node fetch/Node fs/child_process(mihomo.exe)
  Android: Capacitor Preferences/CapacitorHttp/Capacitor Filesystem/native libbox plugin
```

- **CoreFacade** — единственный API, который видит рендерер. На Windows он
  исполняется в main-процессе (за IPC, обёртка тонкая), на Android — прямо в
  рендерере (Node нет), поверх Capacitor-адаптеров и нативного движка.
- **@slave-vpn/core** не импортирует ни `fs`, ни `electron`, ни `@capacitor/*` —
  только интерфейсы адаптеров. Это и делает его общим.
- Генераторы конфигов (`@slave-vpn/config`), DNS (`@slave-vpn/dns`),
  сценарии (`@slave-vpn/routing`) уже общие — core их **оркестрирует**.

## 4. Контракты (черновик, финализируется в P0.1)

```ts
// @slave-vpn/core/adapters
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}
interface NetworkAdapter {            // без CORS, с произвольным UA/заголовками
  fetchText(url: string, opts?: { headers?: Record<string,string>; timeoutMs?: number }): Promise<{ status: number; body: string }>
}
interface FsAdapter {                 // для geo-файлов / rule-providers на диске
  readBytes(path: string): Promise<Uint8Array | null>
  writeBytes(path: string, data: Uint8Array): Promise<void>
  exists(path: string): Promise<boolean>
  ensureDir(path: string): Promise<void>
}
interface EngineAdapter {             // запуск/остановка ядра + телеметрия
  start(config: string): Promise<void>
  stop(): Promise<void>
  status(): Promise<VPNStatus>
  setProxy(name: string): Promise<void>
  getProxies(): Promise<ProxyEntry[]>
  getTraffic(): Promise<TrafficStats>
  getConnections(): Promise<ActiveConnectionsSnapshot | null>
  geositeCategories(): Promise<string[]>   // для фильтра неизвестных категорий
  onEvent(cb: (e: RuntimeEvent) => void): () => void
}

// @slave-vpn/core
interface CoreFacade {
  vpn: { connect; disconnect; getStatus; setMode; setProxy; getProxyList; … }
  subscriptions: { list; add; remove; refresh; refreshAll; … }
  settings: { get; set }
  dns: { getProfile; setProfile; getPresets; getStrategies }
  routing: { listScenarios; setEnabledScenarios }
  rules: { list; add; remove; update; reorder; reload }
  geo: { getState; updateAll; updateOne; listSources }
  profiles: { list; saveCurrent; remove; apply }
  events: { onStatus; onTraffic; onRuntimeEvent; … }
}
```

Контракт `CoreFacade` совпадает по форме с текущим `SlaveVPNBridge`, чтобы
рендерер почти не менялся.

## 5. P0 — Фундамент (большой Core-рефактор)

Цель P0: выделить `@slave-vpn/core`, реализовать адаптеры на обеих платформах,
перевести **оба** приложения на `CoreFacade`. Поведение не меняется — это
рефакторинг каркаса. Делается в ветке `feat/core-unification`.

- **P0.1 — Скелет `@slave-vpn/core`.** Создать пакет, интерфейсы адаптеров +
  `CoreFacade`, заглушечная фабрика `createCore(adapters)`. Реэкспорт типов из
  `shared`. Сборка ESM+CJS. *Verify:* `pnpm -r build`.
- **P0.2 — Перенос чистой логики в core.** Без переписывания: настройки-модель,
  оркестрация подписок (объединить Windows `SubscriptionAggregatorService` и
  `android/aggregator.ts` в один `core/subscriptions`), разрешение DNS-профиля,
  композиция сценариев (тонкая обёртка над `routing`), rule-providers модель,
  geo-оркестрация, профили, политика балансера. Всё — поверх адаптеров.
  *Verify:* юнит-проверки чистых функций + `mihomo -t` на сгенерированном конфиге.
- **P0.3 — Windows-адаптеры.** Реализовать Storage(electron-store)/Network(Node
  undici)/Fs(node:fs)/Engine(обёртка над `MihomoEngine`). `RuntimeServiceImpl` и
  IPC-хендлеры становятся тонкими делегатами в `CoreFacade`. *Verify:* Setup
  собирается, подключение на устройстве, `mihomo -t`.
- **P0.4 — Android-адаптеры.** Реализовать Storage(Preferences)/Network
  (CapacitorHttp)/Fs(Capacitor Filesystem)/Engine(нативный плагин +
  `geositeCategories` через JNI или чтение файла). `android/bridge.ts` делегирует
  в тот же `CoreFacade` вместо заглушек. *Verify:* APK, подключение на телефоне.
- **P0.5 — Чистка дублей.** Удалить `android/compile-config.ts`,
  `android/aggregator.ts`, `runtime-settings.ts` (логика теперь в core).
  Свести два пути генерации к одному. *Verify:* обе сборки + регресс.

Риск большой — поэтому P0 идёт серией мелких коммитов, каждый из которых
оставляет обе сборки зелёными; на каждом шаге сверяем `mihomo -t`.

## 6. P1–P5 — Паритет по фичам (через готовый Core)

- **P1 — Единая маршрутизация.** Android переходит с `androidRouting` на
  `routingPolicy` (сценарии). Android сразу получает: композицию сценариев,
  дедуп правил, geosite-фильтр, RU-обход. Удалить `buildAndroidRules`.
- **P2 — Единый DNS.** Android получает DnsProfile + стратегии (вместо одного
  DoH). Удалить `buildAndroidDnsSection`; обе платформы → `MihomoDnsCompiler`.
- **P3 — Единые списки обхода + настройки.** Один стор за `StorageAdapter`.
  RKN-geosite follow-up (geosite-runetfreedom → rule-providers) решается здесь
  один раз для обеих платформ. Раз-гейтить UI (убрать IS_MOBILE-форки).
- **P4 — Профили / geo-UI / балансер / диагностика** на Android через core.
- **P5 — Финальная чистка.** Удалить остаточные IS_MOBILE-ветки, единый E2E
  (`mihomo -t` обоих конфигов) в CI, обновить ANDROID.md/ARCHITECTURE.md.

## 7. Паритет — критерий готовности (DoD)

Фича считается «паритетной», когда:
1. Логика живёт в `@slave-vpn/core` (ни в Windows main, ни в android/*).
2. Рендерер обращается к ней через `CoreFacade` без `IS_MOBILE`-форка.
3. Сгенерированный конфиг проходит `mihomo -t` на обеих платформах.
4. Проверено вживую: Windows-подключение + APK-подключение.

## 8. Принципы безопасности

- Вся работа — в ветке `feat/core-unification`, в `main` не мержим без явного «ок».
- Каждый коммит: typecheck + сборка обоих приложений зелёные.
- Любая правка маршрутизации/DNS — `mihomo -t` на реальном наборе сценариев.
- Секрет-скан перед каждым коммитом; токен подписки в репозиторий не попадает.
- Откат: фазы независимы; если P_n проблемная — откатываем её коммиты, фундамент остаётся.

## 9. Что НЕ входит

- Смена движка (остаёмся на mihomo на обеих платформах — это и есть опора паритета).
- iOS (вне скоупа сейчас).
- Полная реализация `@slave-vpn/provider` white-label (отдельный трек).

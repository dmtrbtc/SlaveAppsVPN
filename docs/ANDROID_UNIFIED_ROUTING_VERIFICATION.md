# Android unified routing — P1, первый срез

Дата: 2026-08-28. База: `main` после релиза `v0.2.41-dev.6`
(`a1ed9d2`). Ветка: `codex/android-unified-routing`.

## Причина

Android уже компилировал часть сценариев через общий `routingPolicy`, но
одновременно передавал в generator второй источник маршрутов —
`androidRouting`. Он сохранял отдельное дерево `buildAndroidRules` и legacy
`smart/global/direct` state. Из-за двух источников fallback и новые сценарии
могли расходиться с Windows.

## Изменение

- `androidRouting` и `buildAndroidRules` удалены из config generator;
- `vpnMode` / `routingPolicy` — единственный источник порядка и default action;
- platform details вынесены в `routingExtras`: node-domain anti-loop,
  rule-providers, geo auto-update и sniffer;
- Android split получает policy с `defaultAction=proxy`, потому что список
  приложений уже применяется нативным `VpnService`; Windows split продолжает
  использовать PROCESS-NAME/direct-default;
- удалён неиспользуемый Android localStorage state `smart/global/direct`;
- В этом срезе `compile-config.ts` оставался тонким сборщиком данных, чтобы не
  смешивать смену routing semantics с новой Core data-source границей. После
  device smoke и merge P1 он удалён отдельным config-boundary срезом; см.
  [ANDROID_CORE_CONFIG_BOUNDARY_VERIFICATION.md](ANDROID_CORE_CONFIG_BOUNDARY_VERIFICATION.md).

## Автоматические проверки

- Config tests: **38/38**.
- Core tests: **46/46**.
- Monorepo typecheck: **24/24**.
- Architecture boundaries: **295/295**.
- Windows renderer regressions: **16/16**.
- Windows production renderer/main/preload build: успешно.
- Mihomo config validation: **7/7** на v1.19.30.
- Android `cap sync`, `lintDebug` и `assembleDebug`: успешно.

Первый Mihomo-прогон специально выявил отсутствующий `availableGeoSites` в
generator fixture после подключения полной bypass policy. Fixture приведён к
production-пути: неизвестные категории фильтруются до запуска Mihomo.

## Device smoke

Собран отдельный APK, не заменяющий production-приложение:

- package: `com.slavevpn.app.dev`;
- version: `0.2.41-dev.routing1`;
- versionCode: `20260836`;
- SHA-256: `538041222EDBE647C28C8AF66648FC91DBEADECDEC0FD278E211AB697CF5CB78`.

APK: `apps/android/android/app/build/outputs/apk/debug/app-debug.apk`.

Проверено 2026-08-30 на физическом Android 16 (`23117RA68G`):

- side-by-side обновление прежнего `com.slavevpn.app.dev` сохранило настройки,
  подписку и данные;
- после явного disconnect/connect новый bypass-конфиг содержит оба RKN
  `RULE-SET`, Telegram balance и `MATCH,SLAVE-SELECT`;
- в режиме `bypass` Telegram совпал с `GeoIP(telegram)` и пошёл через
  `SLAVE-BALANCE`; YouTube/GoogleVideo и Gemini API пошли через
  `SLAVE-SELECT`;
- в режиме `blocked` Gemini core endpoint
  `robinfrontend-pa.googleapis.com` совпал с `GeoSite(google-gemini)` и пошёл
  через VPN; Telegram и YouTube также пошли через VPN, а `yandex.ru`,
  `dzen.ru`, `vk.com` и RU DNS — `DIRECT`;
- Android split проверен с `include` и единственным приложением Telegram:
  системный VPN UID-range содержит только UID Telegram, YouTube отсутствует и
  не появляется в логах Mihomo; сохранённый Mihomo-конфиг не содержит
  `PROCESS-NAME` и заканчивается `MATCH,SLAVE-SELECT`;
- пользователь подтвердил загрузку сообщений и медиа Telegram в split;
- foreground VPN service остался активен, crash/fatal записей нет.

Production-пакет на устройстве остался без изменений: `com.slavevpn.app`,
`0.2.41-dev.5`, versionCode `195`. Опубликованный релиз `v0.2.41-dev.6` и канал
обновления этим срезом не изменяются.

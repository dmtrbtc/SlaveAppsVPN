# Android Core config boundary — config-срез P0.5

Дата: 2026-08-30. База: `main` после merge PR #26 (`64eeef6`).
Ветка: `codex/android-core-config-boundary`.

## Причина

Маршрутизация, DNS и генерация Mihomo YAML уже находились в `@slave-vpn/core`,
но Android сохранял отдельный файл `android/compile-config.ts`. Он вручную
читал подписки и настройки, создавал secret, вызывал Core compiler и повторно
обрабатывал warnings. Это был последний дублирующий orchestration-layer между
`CoreFacade.connect()` и общим Android compiler.

## Изменение

- добавлен общий контракт `CoreConfigProvider`, возвращающий готовый config и
  предупреждения компиляции;
- `createAndroidEngineConfigProvider` собирает config через типизированные
  platform sources: агрегированные прокси, `AppSettings`, rule-lists,
  API-secret и cache-only список geosite-категорий;
- `CoreFacade.connect()` централизованно журналирует размер результата и каждое
  предупреждение, не раскрывая содержимое конфига;
- `android/bridge.ts` только подключает Android data sources и native engine;
- `android/compile-config.ts` удалён;
- порядок cached recovery → platform data load → compilation → engine start и
  routing/DNS semantics не изменены.

## Автоматические проверки

- Core tests: **48/48**.
- Monorepo typecheck: **24/24**.
- Architecture boundaries: **295/295**.
- Config tests: **38/38**.
- Windows renderer regressions: **16/16**.
- Mihomo config validation: **7/7** на v1.19.30.
- Windows production renderer/main/preload build: успешно.
- Android `cap sync`, `lintDebug` и `assembleDebug`: успешно.

## Side-by-side APK

- package: `com.slavevpn.app.dev`;
- version: `0.2.41-dev.config1`;
- versionCode: `20260837`;
- SHA-256: `0A6428F7F4F230A456F839C44CE313575A3A8A47937BB9FC85245700DD3EA8A5`.

APK: `apps/android/android/app/build/outputs/apk/debug/app-debug.apk`.

## Device smoke

- физическое устройство: Android 16, `23117RA68G`;
- установка через `adb install -r` успешна, данные dev-приложения и подписки
  сохранены;
- dev-приложение запустилось без crash/fatal и показало состояние «Защищено»;
- режим: «Обход блокировок», выбранный узел: `Slave-EE`;
- native service сообщил `connected · mihomo v1.19.30`;
- runtime-логи подтвердили DNS-resolve, успешную REALITY-аутентификацию,
  активные соединения через `SLAVE-SELECT[Slave-EE]` и живые health-checks;
- выполнен ручной disconnect/connect: обычный reconnect не использует native
  cached recovery, поэтому этот путь заново проходит через Core config provider.
- post-reconnect readback: `state=connected`, `mode=bypass`,
  `activeProxy=Slave-EE`, `lastError=null`;
- штатный url-test `Slave-EE`: **56 ms**;
- snapshot активных соединений подтвердил Google traffic через
  `SLAVE-SELECT[Slave-EE]` и российский Yandex traffic через `DIRECT`;
- `SlaveVpnService` остался foreground-сервисом, в post-reconnect logcat нет
  `FATAL EXCEPTION`, `Fatal signal`, ANR или падения процесса.

Production package `com.slavevpn.app` остался установленным отдельно на версии
`0.2.41-dev.5` (`versionCode 195`) и этой сборкой не заменялся.

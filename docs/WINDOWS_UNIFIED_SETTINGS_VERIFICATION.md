# P3.1 — текущая проверка 2026-09-08

Локальный этап реализации и автоматической проверки завершён на ветке
codex/unified-settings-store, HEAD f3277ffcebe462702f744d4585e02413488cda95.
Изменения остаются незакоммиченными; это не опубликованный релиз.

- Сохранена подготовленная миграция Windows на общий SettingsStore.
- Два новых теста воспроизвели изменение вложенных настроек через внешние
  ссылки. Глубокие копии теперь изолируют defaults, patch, get/getAll и очередь.
- Проверены порядок patch/reset/patch, передача ошибки записи и восстановление
  очереди следующей полной записью.
- Updater применяет канал после успешной записи и больше не скрывает ошибку.
  Тест выполняет реальный метод с подменёнными Electron и хранилищем.
- Файловый тест проверяет defaults при отсутствии/повреждении JSON и повторное
  чтение записанных настроек новым экземпляром общего стора.
- Core: 61/61; Windows/renderer: 26/26; typecheck: 24/24 (21 cached);
  boundaries: 295/295; Windows build и git diff --check: успешно.
  Сохранилось предупреждение module type PostCSS.

Только синтетические данные и временные файлы. Реальные настройки,
установленный клиент, VPN и Android-устройство не использовались. APK и
установщик не пересобирались. Результаты ниже исторические.

Семантика ошибок: память обновляется до записи; ошибка отклоняет promise без
отката памяти. Следующая успешная запись сохраняет полный текущий снимок.
Это не транзакция UI/runtime/диск. Временный файл с copyFile fallback не
гарантирует сохранность при отключении питания; fsync и аварийное завершение
во время fallback не проверены.

Перед выпуском остаются изолированный Windows smoke загрузки до IPC,
изменения/перезапуска/сохранения настроек и Android device smoke. Интеграция с
отдельной lifecycle-веткой dev.11 требует самостоятельного этапа: текущая база
не содержит её исправлений bootstrap/runtime.

## Историческая проверка первого среза
# P3.1 — единый SettingsStore на Windows

Дата: 2026-09-01. База: `main` после релиза `v0.2.41-dev.10`.

## Граница среза

Windows больше не содержит собственную реализацию модели/кэша настроек.
`apps/windows/src/main/services/SettingsStore.ts` создаёт общий
`@slave-vpn/core.SettingsStore`, а платформа предоставляет только файловый
`JsonFileStorageAdapter`.

Срез намеренно не меняет маршрутизацию, rule-provider, geo-источники или UI.
Их перенос выполняется следующими независимыми этапами P3.

## Совместимость данных

- путь остаётся прежним: `userData/settings.json`;
- JSON остаётся плоским объектом `AppSettings`, без key/value envelope;
- частичные старые файлы объединяются с актуальными shared defaults;
- отсутствующий или повреждённый файл безопасно даёт defaults, как раньше;
- запись выполняется через временный файл с Windows fallback замены;
- `patch()` и `reset()` ставят immutable snapshots в общую последовательную
  очередь, поэтому более старая асинхронная запись не может затереть новую.

## Startup и mutations

`initSettingsStore()` выполняется после `app.whenReady()`, но до:

1. регистрации IPC handlers;
2. создания окна и tray;
3. запуска updater;
4. provider/runtime bootstrap.

Все Windows call sites, изменяющие настройки, ожидают `patch()`: settings, DNS,
балансер, split tunnel, routing scenarios, profiles, updater и tray actions.

## Автоматические проверки

- Core SettingsStore: legacy partial load, undefined filtering, complete
  snapshots и ordered concurrent writes.
- Windows adapter: чтение старого flat JSON, замена файла без envelope и запрет
  посторонних storage keys.
- Core tests: 58/58.
- Windows renderer tests: 24/24.
- Workspace typecheck: 24/24.
- Architecture boundaries: 295/295.
- Workspace lint: успешно.
- `mihomo -t`: 8/8 конфигураций на v1.19.30.
- Windows Electron build: успешно.
- Capacitor sync, Android `lintDebug` и `assembleDebug`: успешно.

## Side-by-side APK

- package: `com.slavevpn.app.dev`;
- versionName: `0.2.41-dev.settings1`;
- versionCode: `20260902`;
- SHA-256: `ca8f882fb05818907f957adf20461da2a8d60b6f6e98643e0f70c6823be2da27`.

Production package не заменяется. Device smoke остаётся отдельной контрольной
точкой: на момент сборки `adb devices -l` не показывал подключённых устройств.

## Дополнение 2026-09-08: реальный Electron storage smoke

Команда воспроизведения: `node scripts/windows-settings-electron-smoke.cjs`.
Результат: [WINDOWS_SETTINGS_ELECTRON_SMOKE.json](WINDOWS_SETTINGS_ELECTRON_SMOKE.json).

Два отдельных процесса Electron 39.8.10 успешно завершились. Реальные Windows
singleton/адаптер и собранный core прочитали старый плоский JSON, выполнили
конкурентную инициализацию и записи, затем подтвердили сохранение после
перезапуска процесса. Только синтетические настройки, отдельные временные
userData/sessionData, без запуска production entrypoint; каталог удалён.

Это подтверждает Electron + файловое хранилище, но не полный startup/IPC/UI.
Обычный entrypoint регистрирует общий протокол и меняет автозапуск; полного
изолированного режима нет. Для дальнейшего smoke нужен такой режим или
одноразовая Windows-среда. Android не проверен: adb не найден в PATH и двух
проверенных стандартных расположениях. Наличие устройства не определялось.

## Android P3.1 — устройство, 2026-09-08

Прежний блокер adb снят: инструмент найден в E:\dev\Android\platform-tools.
Телефон авторизован, Android API 36. Из текущих web-ресурсов собран и установлен
новый отдельный пакет com.slavevpn.app.p31smoke / 0.2.41-dev.p31smoke /
20260908; основной и прежний dev-пакеты не заменялись. Подпись APK v2 проверена.
SHA256: ba475f8e94e84f8e704a7b48bc7668284e19241ac708f6bed2f92efc92dbec1c.

[ANDROID_P31_DEVICE_SMOKE.json](ANDROID_P31_DEVICE_SMOKE.json) подтверждает
конкурентную запись через настоящий Android bridge, совпадение localStorage и
native Preferences и восстановление после холодного перезапуска процесса.
В журнале перезапущенного тестового процесса FATAL EXCEPTION не обнаружено.
Проверка автоматическая через WebView, без ручного визуального/UI smoke.
Не проверялись подключение VPN, обновление существующего приложения, reboot
телефона и потеря питания. Только синтетические настройки нового пакета.

ADB forward удалён, тестовое приложение остановлено и оставлено установленным.
Полный Windows UI smoke и интеграция lifecycle dev.11 остаются отдельными этапами.

## Windows settings UI smoke — 2026-09-08

Development-only режим `--isolated-settings-smoke` принимает только маркированный
временный каталог `slave-settings-ui-*` через `SLAVE_SETTINGS_SMOKE_DIR`.
Отдельная identity/userData/sessionData задаётся до lock/logs/safe-mode state.
Отключены общий протокол, автозапуск, tray, updater setup и power callbacks;
bootstrap работает в safe mode. Доступен только settings get/set через обычную
IPC-валидацию. Sandbox/contextIsolation не ослаблены, nodeIntegration выключен.

`node scripts/windows-settings-ui-smoke.cjs` проверил собранные main/preload/
renderer: штатную кнопку пропуска onboarding, страницу настроек, переключатель
«Свернуть в трей», диск и сохранение после выхода/нового запуска. Два процесса
завершились; попыток регистрации протокола/login items нет. Снимок страницы
визуально проверен после краткого showInactive; скрытое окно давало старый кадр.

Evidence: [WINDOWS_SETTINGS_UI_SMOKE.json](WINDOWS_SETTINGS_UI_SMOKE.json),
[снимок](WINDOWS_SETTINGS_UI_SMOKE.png). Прошли 26 renderer-тестов и 3 новых
isolation-теста, typecheck 24/24, boundaries 295/295, Windows build/diff check.
Это settings UI smoke при выключенном provider/runtime, а не полный VPN smoke.
На узкой странице заметно обрезание кнопки подписки; layout-аудит не выполнялся.
Перед выпуском остаётся отдельная интеграция с lifecycle dev.11 и соответствующие
регрессии. Никаких commit/push/merge/release в этом этапе.

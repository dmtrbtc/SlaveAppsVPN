# Android unified settings migration — P0.5, третий срез

Дата: 2026-08-27. База: `main` после PR #24 (`1074dcf`).
Ветка разработки: `codex/android-settings-migration`.

## Причина

Android уже сохранял полный `AppSettings`, но rule-lists продолжали жить в
отдельном localStorage-ключе `slave.settings.ruleLists.v1`. Старый DoH-ключ
`slave.settings.dnsProvider.v1` оставался fallback-источником, который фактически
перекрывался default-значением unified store. В результате UI, настройки и
компилятор имели несколько источников истины, а удаление `runtime-settings.ts`
могло потерять пользовательский DNS, toggle списков или interval.

## Исправление

- валидные legacy DoH/rule-list значения импортируются при загрузке settings;
- уже сохранённые unified-значения никогда не перезаписываются legacy-данными;
- старый `ruleProviders: []` считается мигрируемым, потому что предыдущие
  Android-версии записывали пустой массив, пока реальный список жил отдельно;
- сохраняются пользовательские URL, domain/ipcidr behavior, enabled, builtin и
  `intervalHours`; известный нерабочий URL заменяется тем же self-heal правилом;
- legacy-ключи удаляются только после подтверждённой awaited-записи полного
  unified snapshot в native Preferences; при ошибке они остаются для retry;
- Android rules API и compile-config читают один `AppSettings.ruleProviders`;
- сохранённые presets побеждают каталог по ID, а новые presets добавляются при
  чтении; direct/reject и пустые builtins не попадают в Android bypass providers;
- `runtime-settings.ts` удалён.

`compile-config.ts` пока сохранён как тонкий сборщик Android platform inputs.
Маршрутизация, DNS-секция и Mihomo YAML по-прежнему компилируются в core; смена
connect-path относится к отдельному P1-срезу.

## Автоматические проверки

- Renderer: **16/16**, включая 3 regression-теста миграции.
- Core: **44/44**, включая сохранение stored preset и interval при merge.
- Monorepo typecheck: **24/24** задач.
- Architecture boundaries: **295**, нарушений нет.
- Mihomo: **7/7** конфигов на v1.19.30.
- Windows production bundle — успешно.
- Android `cap sync`, `lintDebug`, `assembleDebug` — успешно.
- Встроенный в APK renderer совпадает с проверенным production bundle по
  SHA-256.

## Тестовый APK

- Package: `com.slavevpn.app.dev`.
- Версия: `0.2.41-dev.settings2`, code `20260835`.
- SHA-256: `e2153e9450b84bfe231333349bad506acba11e2ac4458a9394a4561b8a94eae9`.
- Подпись v2 проверена; один debug signer.

## Device smoke

Проверено 2026-08-27; финальный durability follow-up выполнен 2026-08-28 на
Xiaomi 23117RA68G, Android 16:

- перед обновлением `hydration3` содержал unified settings (`cloudflare`,
  `ruleProviders: []`), legacy-ключей не было; rules API возвращал 6 catalog
  defaults, подписка — 1 / 5 серверов;
- для проверки именно migration-path создан обратимый fixture: исходные
  DoH/ruleProviders сохранены отдельно, unified DoH временно удалён, а legacy
  ключи получили `google`, 6 текущих presets и один отключённый provider с
  interval 7 часов;
- `adb install -r` обновил только `com.slavevpn.app.dev` до `settings1`;
- первый запуск перенёс DoH `google` и 7 providers одновременно в localStorage
  и Preferences, удалил оба legacy-ключа и сохранил у fixture `enabled=false` /
  `intervalHours=7`;
- подписка и серверы не изменились: 1 подписка, 5 серверов, 4 VLESS +
  1 Hysteria2;
- режим `blocked` успешно перекомпилировался и подключился на migrated settings:
  оба probe-входа успешны, 5/5 целей, engine URL-test 91 ms;
- Telegram вернул HTTP 200, YouTube — 204, Gemini — 200;
- исходные `cloudflare` / `ruleProviders: []` восстановлены через публичный
  settings API. До и после холодного запуска оба хранилища совпали, fixture,
  backup и legacy-ключи отсутствуют, rules API снова вернул 6 defaults;
- fatal AndroidRuntime/libc сообщений нет; debug-VPN отключён, ADB forward
  удалён.

Полный функциональный smoke выше выполнен на `settings1`. После него cleanup
миграции усилен: legacy удаляется только после awaited-записи unified snapshot
в Preferences. Финальный `settings2` повторно проверен тем же fixture:

- первый снимок до завершения `settingsReady` сохранил legacy-ключи и старый
  unified snapshot — данные не удаляются преждевременно;
- после готовности localStorage и Preferences одновременно содержали `google`
  и 7 providers, legacy исчез, fixture сохранил `enabled=false` / 7 часов;
- probe прошёл 5/5, активный engine URL-test — 99 ms;
- исходные `cloudflare` / `ruleProviders: []` восстановлены в обоих хранилищах;
  после холодного запуска legacy/backup/fixture отсутствуют, подписка 1 и
  5 серверов сохранены, fatal AndroidRuntime/libc сообщений нет;
- debug-VPN отключён, ADB forward удалён.

Production-приложение осталось `0.2.41-dev.5` (code 195, прежнее время
обновления 2026-08-25 20:33:50) и не запускалось тестом.

Release tags и канал обновления не изменяются.

# Android subscription sources — P0.5, первый срез

Дата: 2026-08-26. База: `main` после PR #22 (`80e9c2d`).
Ветка разработки: `codex/android-subscription-sources`.

## Изменение

Удалён `apps/windows/src/renderer/src/android/aggregator.ts`:
его парсинг URL/URI, best-effort восстановление UDP-протоколов и обновление
метаданных живут в `packages/core/src/subscriptions/createSubscriptionFetcher.ts`.
Обход подписок выполняет общий `aggregateSubscriptionProxies`; YAML-проекция
`aggregateSubscriptions` использует тот же путь без повторной загрузки.

Android `adapters/subscriptions.ts` передаёт только существующие операции HTTP и
хранилища. Bridge, список серверов, probe и config-provider используют этот
адаптер. Модель записи подписки импортируется из core вместо локального дубля.
Удалённый файл и предыдущая реализация доступны в истории Git.

Сохранены:

- localStorage-primary / Preferences-mirror и все прежние ключи данных;
- HWID, таймауты и UA fallback основного HTTP-запроса;
- последовательная обработка Android-подписок и ожидание записи метаданных;
- восстановление только отсутствующих UDP-узлов, без замены VLESS/REALITY;
- пропуск alt-запросов, если primary уже содержит UDP-протокол;
- частичный успех, дедупликация, порядок источников и теги `slave-source`;
- отсутствие запуска VPN при получении списка/проверке серверов.

Сообщение для неподдерживаемого типа источника теперь платформонезависимо:
`Unsupported subscription source type: ...`. Поддержка новых типов не добавлена.
DNS, маршрутизация, балансер, версия Mihomo и updater не изменены.

## Автоматические проверки

- Core: **42/42**, в том числе **13 новых тестов** подписок; входят в стандартный
  `pnpm --filter @slave-vpn/core test`, который выполняется CI.
- Renderer queries: **2/2**, включая обновление серверов при ложном offline WebView.
- `pnpm typecheck`: **24/24** задачи.
- `pnpm validate:boundaries`: **295** правил, нарушений нет.
- `node scripts/validate-mihomo-configs.mjs`: **7/7** конфигов на Mihomo **v1.19.30**.
  Новый случай `android-core-subscription-recovery` проверяет весь путь от
  primary VLESS + alt Hysteria2/TUIC до конфига, принимаемого `mihomo -t`.
  Используются только синтетические источники и ключи, без сетевых подписок.
- Windows: production bundle (`pnpm --filter @slave-vpn/windows build`).
- Android: `cap sync`, `lintDebug` и `assembleDebug` — успешно.
- `git diff --check` — без ошибок.

`pnpm lint` завершается успешно, но в текущем workspace нет отдельных lint-задач:
этот запуск не является дополнительным полноценным анализом исходников.

## Тестовый APK

- Файл: `apps/android/android/app/build/outputs/apk/debug/app-debug.apk`.
- Package: `com.slavevpn.app.dev` — отдельный от production.
- Версия: `0.2.41-dev.sources1`, code `20260830`.
- SHA-256: `695d3a0994b94971ce44be830fbba99ba098c3ba955c774ff6a56b4e734f59dd`.
- Debug-подпись v2 проверена `apksigner`; JNI содержит `arm64-v8a` и `armeabi-v7a`.
- JS bundle `index-CqvLIcTa.js` внутри APK побайтно совпадает с проверенной
  Windows/web-сборкой (сравнение SHA-256).

## Проверка на физическом устройстве

Выполнено 2026-08-27 на Xiaomi 23117RA68G (`emerald`), Android 16. Установлен
только отдельный пакет `com.slavevpn.app.dev`; production-пакет остался на
`0.2.41-dev.5` с прежним временем обновления.

- Debug-пакет обновлён с `0.2.41-dev.probe2` через `adb install -r`.
- Preferences сохранили 1 активную подписку; после восстановления localStorage
  и после отдельного холодного перезапуска: 5 серверов, `lastError` пустой.
- Состав серверов после нового core-пайплайна: 4 VLESS + 1 Hysteria2.
- Одновременные `vpn.probeAll` и `servers.probe`: по 5 одинаковых событий двум
  независимым подписчикам, 5/5 успешных; состояние VPN не изменилось.
- В отключённом состоянии direct API и кнопка «Пинг» проверили 5/5 серверов.
  Повтор при синтетическом `navigator.onLine=false` также завершился 5/5,
  кнопка разблокировалась, глобальное online-состояние после теста восстановлено.
- Подключение в режиме `blocked` успешно; отдельный engine URL-test через
  выбранный прокси: 41 ms.
- Через активный Android VPN: Telegram — HTTP 200, YouTube `generate_204` — 204,
  Gemini — HTTP 200. Это HTTP smoke, а не измерение скорости/UDP-трафика.
- После disconnect + force-stop + запуска: VPN `disconnected`, подписка и
  состав серверов сохранены. Fatal `AndroidRuntime`/`libc` сообщений нет.
- В конце debug-VPN отключён, ADB WebView forwarding удалён.

При самом первом запросе сразу после установки bridge кратковременно вернул
пустой список; значения подписки при этом присутствовали в Preferences. После
инициализации Preferences список восстановился без повторного ввода, а холодный
повторный запуск уже сразу вернул 1 подписку и 5 серверов. Это не потеря данных,
но короткое окно гидратации стоит отдельно устранить в следующем срезе.

## Границы проверки и следующий шаг

Это ещё не завершение P0.5: Windows cabinet/cache-источники и Android
`compile-config.ts` остаются для следующих срезов. `runtime-settings.ts` удалён
следующим отдельным срезом с миграцией данных в единый `AppSettings`.
Существующая зависимость probe от доступности подписки и межзапросные гонки
хранилища не исправлялись; `concurrency: 1` действует внутри одного batch.

Device smoke этого среза завершён. Короткое окно первой гидратации Preferences
зафиксировано выше как follow-up и устранено storage-hydration срезом. Windows
cabinet/cache-источники и Android config остаются следующими архитектурными
срезами.

Production-клиент, release tags и канал обновления не изменялись.

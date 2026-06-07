<div align="center">

# 🛡️ SLAVE VPN

**VPN-клиент для обхода блокировок — Android и Windows, на ядре mihomo (Clash.Meta).**

Подключение по подписке (Remnawave), умная маршрутизация «РФ — напрямую, заблокированное — через VPN», поддержка VLESS-Reality с шифрованием, Hysteria2, Trojan и других протоколов.

[![Релиз](https://img.shields.io/badge/релиз-v0.2.0--alpha.1-blue)](https://github.com/dmtrbtc/SlaveAppsVPN/releases/latest)
[![Платформы](https://img.shields.io/badge/платформы-Android%20%7C%20Windows-green)]()
[![Статус](https://img.shields.io/badge/статус-alpha-orange)]()

</div>

---

## 📥 Скачать (последняя альфа — v0.2.0-alpha.1)

Все сборки — на странице релиза: **[github.com/dmtrbtc/SlaveAppsVPN/releases/latest](https://github.com/dmtrbtc/SlaveAppsVPN/releases/latest)**

| Платформа | Файл | Прямая ссылка |
|---|---|---|
| 🤖 **Android** (arm64) | `SlaveAppsVPN-Android-debug.apk` | [Скачать APK](https://github.com/dmtrbtc/SlaveAppsVPN/releases/download/v0.2.0-alpha.1/SlaveAppsVPN-Android-debug.apk) |
| 🪟 **Windows** (установщик) | `SlaveAppsVPN-Setup-v0.2.0.exe` | [Скачать Setup](https://github.com/dmtrbtc/SlaveAppsVPN/releases/download/v0.2.0-alpha.1/SlaveAppsVPN-Setup-v0.2.0.exe) |
| 🪟 **Windows** (portable) | `SlaveAppsVPN-Portable-v0.2.0.exe` | [Скачать Portable](https://github.com/dmtrbtc/SlaveAppsVPN/releases/download/v0.2.0-alpha.1/SlaveAppsVPN-Portable-v0.2.0.exe) |

> ⚠️ Это **альфа**, debug-сборки без цифровой подписи. Android попросит разрешить «установку из неизвестных источников»; Windows SmartScreen покажет предупреждение («Подробнее → Выполнить в любом случае») — это нормально для неподписанной альфы.

---

## ✨ Что умеет

- **Подключение по подписке** Remnawave (URL подписки) — узлы подтягиваются автоматически.
- **Ядро mihomo (Clash.Meta)** на обеих платформах. Поддержка протоколов:
  - **VLESS** + **Reality** + **XTLS-Vision**, в т.ч. **шифрование ML-KEM-768 / X25519** (постквантовое);
  - **Hysteria2**, **TUIC** (QUIC/UDP);
  - **Trojan**, **VMess**, **Shadowsocks**.
- **Умная маршрутизация (РФ-сплит):** российские сайты идут напрямую (быстро), заблокированное — через VPN. Режимы: **Умный / Глобальный / Отладка (прямой)**.
- **Списки обхода РКН** (домены заблокированных ресурсов из публичных списков) с ручным обновлением по кнопке.
- **Автобалансер** — режим «Авто»: автоматически выбирает быстрейший узел; либо ручной выбор сервера.
- **Пинг серверов** прямо на дашборде и в списке серверов.
- **Защищённый DNS** (DoH через туннель, без утечек; РФ-домены резолвятся напрямую для скорости).
- **Диагностика:** живой поток событий, логи ядра (копировать / поделиться), self-test.
- **Системный трей** и **раздельный туннель по процессам** (Windows).

---

## 🚀 Как пользоваться

1. **Установите** приложение (см. раздел «Скачать»).
2. **Добавьте подписку:** на экране входа/онбординга вставьте **URL вашей подписки** Remnawave (можно просто скопировать ссылку в буфер — приложение её подхватит).
3. **Выберите сервер** на дашборде (или включите режим **«Авто»**).
4. Нажмите большую кнопку **«Подключить»**. При первом запуске Android запросит разрешение на VPN.
5. (Опционально) В разделе **«Маршрутизация»** выберите режим: *Умный* (рекомендуется), *Глобальный* или *Отладка*.

> Для работы нужна **активная подписка с узлами** на стороне панели (Remnawave). Без узлов список серверов будет пуст.

---

## 🔌 Поддерживаемые протоколы

| Протокол | Транспорт | Примечание |
|---|---|---|
| VLESS + Reality | TCP / XTLS-Vision | + шифрование ML-KEM-768 / X25519 |
| Hysteria2 | QUIC / UDP | может резаться DPI (ТСПУ) на некоторых сетях |
| TUIC | QUIC / UDP | — |
| Trojan | TCP / TLS | — |
| VMess | TCP / WS / gRPC | — |
| Shadowsocks | TCP / UDP | — |

Подписка читается из форматов: **Clash YAML**, **sing-box JSON**, **base64 (vless://…)**, **v2rayN/Xray-массив** (откуда дополнительно восстанавливаются Hysteria2-узлы, которых нет в Clash-профиле панели).

---

## 🏗️ Архитектура (кратко)

Монорепозиторий (pnpm workspaces). **Один React-рендерер** обслуживает обе платформы.

```
apps/
  windows/        Electron (main + preload + renderer) — десктоп
  android/        Capacitor-обёртка + нативный VpnService (Kotlin) + clashbox.aar
packages/
  config/         Парсеры подписок, генератор mihomo-конфига, компиляторы
  routing/        Движок правил маршрутизации (DSL → pipeline → Mihomo rules)
  dns/            DNS-профили и компилятор
  shared/         Общие типы и модели
```

- **Windows:** Electron-main запускает `mihomo.exe` как отдельный процесс и общается с ним по Clash-API; рендерер ↔ main — через типизированный IPC.
- **Android:** `mihomo` вкомпилирован в `clashbox.aar` (gomobile, сборка с тегом `cmfa`); нативный `VpnService` отдаёт TUN-дескриптор в ядро; рендерер общается через мост `window.slaveVPN`. Ядро инициализируется **только при подключении** (lifecycle-guard), чтобы не нагружать запуск приложения.

---

## 🛠️ Сборка из исходников

Требуется: **Node 20+**, **pnpm**. Для Android дополнительно — JDK 21, Android SDK/NDK, Go + gomobile.

```bash
pnpm install

# Windows: установщик + portable (в apps/windows/release/)
pnpm --filter @slave-vpn/windows dist

# Проверка типов / сборка рендерера
pnpm --filter @slave-vpn/windows typecheck
pnpm --filter @slave-vpn/windows build
```

Android APK собирается в CI — `.github/workflows/android.yml`. Локальная сборка: см. [docs/ANDROID.md](./docs/ANDROID.md).

---

## ⚠️ Известные ограничения (alpha)

- Сборки **не подписаны** (предупреждения SmartScreen / «неизвестный источник»).
- **Hysteria2 = QUIC/UDP** — в РФ может блокироваться ТСПУ; VLESS-Reality остаётся основным рабочим протоколом.
- Android: нужен **arm64** (обычный телефон); x86-эмулятор не поддержан.
- Ранняя альфа — возможны баги. Логи и обратная связь приветствуются (Диагностика → Логи → «Копировать»).

---

## 🔒 Приватность

Приложение не собирает телеметрию. Данные не отправляются никуда, кроме вашего VPN-сервера и сервера подписки. Весь трафик идёт через ваши собственные узлы.

---

## 📚 Документация

| Документ | Описание |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Архитектурные решения и слои |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Руководство разработчика |
| [docs/ANDROID.md](./docs/ANDROID.md) | Сборка и устройство Android-клиента |
| [ROADMAP.md](./ROADMAP.md) | Дорожная карта |

---

<div align="center">

**[⬇️ Скачать последнюю альфу](https://github.com/dmtrbtc/SlaveAppsVPN/releases/latest)** · сделано с ❤️ для свободного интернета

</div>

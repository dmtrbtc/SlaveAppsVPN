# Release Checklist — v0.3.0 (stable)

Процесс релиза: push тега → release.yml (валидатор + draft) → ручной
workflow_dispatch windows.yml/android.yml с release_tag → ручной QA →
`gh release edit <tag> --draft=false` (для stable — БЕЗ --prerelease).

## Автоматические гейты (до attach артефактов)

- [x] Preflight в windows.yml/android.yml: typecheck + lint + все тесты
- [x] `mihomo -t` на сгенерированных конфигурациях
- [x] Пины SHA256: mihomo / sing-box / wintun; сверка commit тега mihomo
- [x] validate-release-readiness (версии, notes, CHANGELOG)
- [x] Android: подпись upload-ключом, пин сертификата SHA-256

## Ручной QA перед publish (Windows, чистая машина/ВМ)

- [ ] Первый запуск: окно ≤ 5 с, bootstrap ≤ 15 с, нет ошибок в логе
- [ ] Upgrade path: установка поверх v0.2.40 — настройки, подписки и токены
      переживают апгрейд; нет дубля в «Установке программ»
- [ ] Откат: переустановка v0.2.40 поверх v0.3.0 не ломает запуск
- [ ] SmartScreen: предупреждение на неподписанном Setup (ожидаемо;
      «Подробнее → Выполнить в любом случае») — задокументировано
- [ ] Обновление баннером со stable v0.2.40 → предложение v0.3.0
- [ ] Обновление с dev-сборки (0.2.41-dev.21) → предложение v0.3.0
- [ ] Portable-вариант запускается и завершается чисто

## Ручной QA (Android)

- [ ] APK устанавливается поверх dev.21, данные сохраняются
- [ ] Подключение/отключение, смена узла, ребут устройства

## Публикация

- [ ] `gh release edit v0.3.0 -R dmtrbtc/SlaveAppsVPN --draft=false`
      (без --prerelease — релиз займёт releases/latest)
- [ ] После публикации НЕ выпускать теги v0.3.0-* (semver: релиз старше
      собственных пре-релизов); следующая dev-линия — v0.3.1-dev.N

## Post-Release

- [ ] Отметить выполненное в docs/ReleaseAudit.md
- [ ] Мониторинг: issues, обновления каналов, краш-репорты из логов

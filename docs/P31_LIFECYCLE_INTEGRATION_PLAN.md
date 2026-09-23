# План интеграции P3.1 и lifecycle dev.11

Дата: 2026-09-08. Статус: только анализ и план, код не объединён.

## Проверенная база

- P3.1: E:\SlaveApps, codex/unified-settings-store, HEAD
  f3277ffcebe462702f744d4585e02413488cda95, незакоммиченные tracked и untracked файлы.
- Lifecycle: E:\SlaveApps\.worktrees\windows-lifecycle,
  codex/windows-lifecycle-fix, HEAD 2ce419d7fa5daeac8103695dd29976ab1ebf4ef1;
  только docs/CODEX_STATE.md untracked. Исходники lifecycle уже в коммите.
- Общая база изменений: f3277ff. Интеграцию строить поверх точного 2ce419d,
  чтобы не потерять опубликованные lifecycle-исправления.
- Общие изменённые файлы: CHANGELOG.md, apps/windows/package.json,
  bootstrap.ts, ipc/handlers/profiles.handler.ts и ipc/registry.ts.
  Это пересечение файлов, не результат пробного merge. Merge не выполнялся.

## 1. Сохранить исходное состояние

В отдельном этапе реализации создать каталог интеграции/ветку
codex/p31-lifecycle-integration от точного 2ce419d. Перед переносом сохранить
binary-safe diff P3.1 и явный список untracked исходников/тестов/документов с
SHA256. Не копировать пользовательские настройки, node_modules, сборочные
каталоги, APK/EXE и .git. Не использовать stash/reset в исходных каталогах.
Исходный P3.1 и lifecycle worktree оставить неизменными; после переноса сверить
HEAD/status и контрольные суммы исходного набора. Отдельный handoff интеграции.

## 2. Объединить изменения по смыслу

| Область | Решение |
|---|---|
| bootstrap.ts | Сохранить единственного владельца recovery из dev.11, invalidation агрегатора и причины profile-apply. Добавить ожидание SettingsStore и async mutations P3.1. |
| profiles.handler.ts | Сохранение снимка await из P3.1 перед markApplied; затем lifecycle notification с profile-apply. Проверить ошибки обоих шагов; dev.11 notifySubscriptionsChanged ловит ошибку внутри, поэтому await сам по себе не доказывает успешное применение. |
| ipc/registry.ts | Сохранить передачу channel в validated из dev.11 и ограничение IPC для smoke из P3.1. Обычный запуск без smoke должен иметь полный набор handlers. |
| package.json / CI | Сохранить test:lifecycle и его CI-шаг, дополнить test:renderer тестами P3.1. Не откатить версию к dev.1; новая версия/релиз решаются отдельно. |
| CHANGELOG / отчёты | Сохранить обе группы изменений. Старые результаты относятся к исходным наборам; интеграции нужны собственные отчёты. |
| core / runtime / lockfile | Оставить общий SettingsStore P3.1 и lifecycle runtime dev.11. Сохранить lockfile dev.11 и проверять frozen install; новых зависимостей по текущему плану нет. |

## 3. Устранить скрытую несовместимость runtime/settings

В dev.11 RuntimeServiceImplConfig.setSettings и поле класса имеют тип
(patch) => void, а setMode/setSelectedProxy вызывают их без await. P3.1 patch()
возвращает Promise<AppSettings>. TypeScript допускает async функцию на месте
void callback: чистый merge/typecheck может пропустить ошибку порядка и rejection.

Планируемый контракт: setSettings допускает void | Promise<void>; bootstrap
передаёт async callback, ожидающий settings.patch и не возвращающий AppSettings.
Runtime ожидает persistence до запуска применения. Синхронные тестовые setters
сохраняют совместимость.

Одного await недостаточно. До него фиксировать ревизию команды/соединения, после
него проверять актуальность и состояние подключения до engine apply. Для mode
также исключить запоздалое применение старого режима. Сохранить выбор AUTO как
намерение группы, не заменять наблюдаемой leaf-нодой.

Отдельно согласовать в коде очередь persistence/apply/refresh: refresh не должен
обходить незавершённую запись и применять промежуточный снимок. Ошибка записи
отклоняет команду без нового engine apply от этой команды и без успешного
события. Общий SettingsStore сохраняет текущую optimistic-memory семантику:
rollback памяти не обещается, последующая успешная полная запись может включать
раннее намерение. Проверить поведение refresh после ошибки; не объявлять полную
транзакционность UI/settings/runtime. Решение фиксировать интеграционными тестами.

## 4. Проверки интеграции

Сначала новые воспроизводимые тесты на реальном Core SettingsStore + production
RuntimeServiceImpl/RuntimeManager с временным файловым адаптером или управляемой
задержкой/ошибкой записи, без настоящих подписок/настроек:

1. Отложенная запись mode/selection: apply и успех не опережают запись.
2. Ошибка записи: команда отклонена, нет её успешного apply/event, следующая
   запись/очередь восстанавливаются; refresh не применяет промежуточное состояние.
3. Disconnect во время записи, две selection-команды, два mode, mode+selection,
   profile-apply+refresh: старое завершение не воскрешает соединение и не
   возвращает старый выбор. Проверить Manual и AUTO.
4. Profile/tray: сохранение, метка applied, notification; явно проверить ошибку
   применения профиля и отсутствие ложной интерпретации проглоченного исключения.
5. Обычный IPC сохраняет channel-диагностику; smoke оставляет только settings;
   init стора предшествует потребителям, обычный запуск не становится smoke.

Затем core tests, runtime tests, Windows lifecycle и renderer tests, workspace
 typecheck, boundaries, diff check, Windows build и 8 Mihomo syntax checks.
Запустить на интегрированном исходном дереве isolated real Mihomo smoke,
Electron storage и Windows UI smoke. Проверить пути всех harness: прежние
main-checkout ссылки не должны тестировать старый core вместо интегрированного.
Собрать свежий отдельный Android smoke-пакет из интеграции и повторить settings
bridge/localStorage/Preferences + холодный restart на устройстве.

Числа старых тестов — ориентир, не критерий: важны выполненные сценарии и
результаты нового дерева. Установщик/упаковка выполняются на этапе подготовки
релиза, не внутри этого плана.

## 5. Критерий завершения и границы

Интегрированное дерево содержит обе группы исправлений; новые сценарии и
регрессии проходят, smoke-отчёты относятся к его версии исходников. Исходные
worktrees сохранены. Подготовлены обзор diff и новый handoff.

Это локальная интеграция, не публикация. Commit/push/merge в main и release
требуют отдельного явного поручения. Старые файлы dev.11 не заменять.
Full TUN/VPN traffic/sleep-resume и реальная установка остаются отдельными
проверками. Обрезание кнопки в узком окне не включать в этот этап.

## Следующее поручение

Выполни локальную интеграцию по docs/P31_LIFECYCLE_INTEGRATION_PLAN.md в отдельном
worktree от 2ce419d. Сохрани исходный незакоммиченный P3.1 и lifecycle worktree,
объедини изменения, исправь async settings/runtime контракт и выполни проверки.
Без коммита, push, merge в main, установки поверх существующего клиента и релиза.
Если live prerequisites отсутствуют — зафиксируй точный пробел отдельно от
пройденных локальных проверок.
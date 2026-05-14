## Что изменилось

Кратко опишите изменения.

## Тип изменений

- [ ] `feat` — новая функциональность
- [ ] `fix` — исправление бага
- [ ] `refactor` — рефакторинг
- [ ] `docs` — только документация
- [ ] `chore` — tooling, deps, build
- [ ] `perf` — производительность

## Затронутые пакеты

- [ ] `packages/routing`
- [ ] `packages/dns`
- [ ] `packages/runtime`
- [ ] `packages/config`
- [ ] `packages/provider`
- [ ] `packages/provider-remnawave`
- [ ] `packages/api`
- [ ] `packages/shared`
- [ ] `apps/windows` (main)
- [ ] `apps/windows` (renderer)

## Architecture Checklist

- [ ] Не нарушает dependency direction (см. ARCHITECTURE.md)
- [ ] Не добавляет Remnawave imports вне `provider-remnawave/`
- [ ] Не передаёт secrets/tokens в renderer
- [ ] Не добавляет Electron imports в routing/dns/config
- [ ] IPC данные валидируются через Zod-схемы
- [ ] Нет circular dependencies

## Проверки

- [ ] `pnpm typecheck` — без ошибок
- [ ] `pnpm build` — собирается успешно
- [ ] Протестировано вручную (описать как)

## Описание тестирования

Опишите как проверили изменения.

## Дополнительные заметки

Любой контекст для ревьюера.

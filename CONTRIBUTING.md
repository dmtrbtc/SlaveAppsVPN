# Contributing to SLAVE VPN

## Архитектурные принципы (обязательны к соблюдению)

Перед тем как писать код, убедитесь что понимаете [ARCHITECTURE.md](./ARCHITECTURE.md).

### Правила зависимостей

```
packages/routing     ← НЕ зависит от: electron, provider, api, UI
packages/dns         ← НЕ зависит от: electron, provider, api, UI
packages/runtime     ← НЕ зависит от: renderer, provider implementation
packages/provider    ← только interfaces, никаких impl deps
apps/windows/renderer ← только через IPC bridge, никаких прямых imports
```

### Запрещено

- Хардкодить `remnawave` где-либо кроме `packages/provider-remnawave/`
- Импортировать `@slave-vpn/provider-remnawave` вне `bootstrap.ts`
- Передавать токены, subscription URL или secrets в renderer
- Добавлять Electron imports в `packages/routing/`, `packages/dns/`, `packages/config/`
- Создавать circular dependencies между пакетами

---

## Структура веток

```
main          ← стабильный продакшн (только через PR)
develop       ← текущая разработка
feature/*     ← новые фичи (ответвляются от develop)
fix/*         ← bug fixes
hotfix/*      ← критические фиксы (ответвляются от main)
release/*     ← подготовка релиза
```

## Workflow

```bash
# 1. Создать ветку от develop
git checkout develop
git pull
git checkout -b feature/your-feature

# 2. Разработка
pnpm install
pnpm dev

# 3. Проверка перед PR
pnpm typecheck
pnpm build
pnpm audit

# 4. Commit
git commit -m "feat(scope): описание изменений"

# 5. PR → develop
```

## Commit Convention

Формат: `<type>(<scope>): <description>`

| Type | Когда |
|---|---|
| `feat` | Новая функциональность |
| `fix` | Исправление бага |
| `refactor` | Рефакторинг без новой функциональности |
| `docs` | Только документация |
| `chore` | Build, deps, tooling |
| `test` | Тесты |
| `perf` | Производительность |

**Scopes:** `routing`, `dns`, `runtime`, `provider`, `api`, `config`, `ui`, `ipc`, `electron`, `monorepo`

Примеры:
```
feat(routing): add remote rule provider with SHA256 checksum
fix(runtime): handle crashed→error state transition correctly
refactor(provider): extract ConfigSource from SubscriptionProvider
docs(architecture): update dependency graph
chore(monorepo): upgrade electron to 34.x
```

## Добавление нового провайдера

1. Создать `packages/provider-<name>/`
2. Реализовать все интерфейсы из `@slave-vpn/provider`
3. Создать `ProviderManifest` с `id`, `displayName`, `capabilities`
4. Зарегистрировать в `ProviderRegistry`
5. Добавить в `bootstrap.ts` через `registry.register()`
6. Обновить `PROVIDER_SYSTEM.md`

**Не** менять логику bootstrap за пределами provider selection.

## Добавление нового VPN-движка

1. Реализовать `VPNEngine` в `packages/runtime/`
2. Создать `RuleCompiler<TOptions>` в `packages/routing/`
3. Создать `DnsCompiler` в `packages/dns/`
4. Windows-специфичный слой — в `apps/windows/src/main/runtime/`
5. Обновить `EngineType` в shared

## Typecheck

```bash
# Весь monorepo
pnpm typecheck

# Конкретный пакет
pnpm --filter @slave-vpn/routing typecheck
```

## Вопросы

Открывайте issue с шаблоном. Архитектурные решения обсуждаются в Discussions.

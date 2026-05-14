---
name: Feature Request
about: Предложить новую функциональность
title: '[FEATURE] '
labels: enhancement
assignees: ''
---

## Проблема / Мотивация

Какую проблему решает эта фича? Что сейчас неудобно или невозможно?

## Предложение

Опишите желаемое поведение.

## Альтернативы

Рассматривали ли другие решения?

## Архитектурный контекст

В каком слое архитектуры это изменение?

- [ ] UI / Renderer
- [ ] Routing Engine
- [ ] DNS Subsystem
- [ ] Provider System
- [ ] Runtime / Engine
- [ ] New Provider
- [ ] New VPN Engine (sing-box, xray, etc.)
- [ ] Platform (Android, iOS, macOS, Linux)
- [ ] Tooling / CI

## Влияние на provider abstraction

- [ ] Затрагивает только один провайдер → реализовать в `packages/provider-X`
- [ ] Затрагивает все провайдеры → изменить `VPNProvider` интерфейс
- [ ] Не затрагивает provider layer

## Дополнительный контекст

Ссылки, mockups, примеры из других VPN-клиентов.

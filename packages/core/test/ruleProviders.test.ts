import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import type { RuleProvider } from '../src/settings/types.ts'

const require = createRequire(import.meta.url)
const {
  mergeWithPresets,
  sortByPriority,
} = require('../dist/cjs/index.js') as typeof import('../src/rules/index.ts')

test('stored preset state wins while new presets are added by id', () => {
  const stored: RuleProvider = {
    id: 'inside-raw',
    name: 'Stored base',
    enabled: false,
    kind: 'github',
    url: 'https://example.com/stored.lst',
    type: 'domain-list',
    action: 'proxy',
    priority: 500,
    isPreset: true,
    intervalHours: 6,
  }
  const providers = mergeWithPresets([stored])
  const overridden = providers.find((provider) => provider.id === 'inside-raw')

  assert.equal(overridden?.enabled, false)
  assert.equal(overridden?.url, 'https://example.com/stored.lst')
  assert.equal(overridden?.intervalHours, 6)
  assert.ok(providers.some((provider) => provider.id === 'preset-runetfreedom-ru-blocked'))
  assert.equal(providers.filter((provider) => provider.id === 'inside-raw').length, 1)
})

test('priority sorting does not mutate the stored provider snapshot', () => {
  const stored: RuleProvider[] = [
    { id: 'b', name: 'B', enabled: true, kind: 'url', url: 'https://b.example', type: 'domain-list', action: 'proxy', priority: 20 },
    { id: 'a', name: 'A', enabled: true, kind: 'url', url: 'https://a.example', type: 'domain-list', action: 'proxy', priority: 10 },
  ]
  assert.deepEqual(sortByPriority(stored).map((provider) => provider.id), ['a', 'b'])
  assert.deepEqual(stored.map((provider) => provider.id), ['b', 'a'])
})

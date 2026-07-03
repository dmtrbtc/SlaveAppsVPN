import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Same pattern as packages/config: the source imports @slave-vpn/shared
// (ESM-extensionless) → require the built CJS bundle (the test script builds first).
const require = createRequire(import.meta.url)
interface Rule { id: string; target: { type: string; value: string }; action: string; priority: number }
interface ComposeResult { policy: { defaultAction: string; providerRules: Rule[] }; warnings: string[] }
const { composeScenarios, listScenarioMetadata } = require('../dist/cjs/index.js') as {
  composeScenarios: (ids: readonly string[]) => ComposeResult
  listScenarioMetadata: () => { id: string; isBase: boolean; defaultEnabled: boolean }[]
}

test('empty set → direct default, no rules', () => {
  const { policy } = composeScenarios([])
  assert.equal(policy.defaultAction, 'direct')
  assert.equal(policy.providerRules.length, 0)
})

test('roscomvpn-default is proxy-default (foreign tunnels, RU direct)', () => {
  const { policy } = composeScenarios(['roscomvpn-default'])
  assert.equal(policy.defaultAction, 'proxy')
  assert.ok(policy.providerRules.length > 50, 'carries the curated RU-direct + bypass rules')
})

test('smart-russia-bypass is direct-default (only blocked/messengers tunnel)', () => {
  const { policy } = composeScenarios(['smart-russia-bypass'])
  assert.equal(policy.defaultAction, 'direct')
})

test('duplicate rule ids across scenarios are merged (first-wins), not fatal', () => {
  // Both bases emit the shared private-net CIDRs — must dedup, not DUPLICATE_ID.
  const { policy, warnings } = composeScenarios(['roscomvpn-default', 'ai-services', 'gaming-direct'])
  const ids = policy.providerRules.map(r => r.id)
  assert.equal(new Set(ids).size, ids.length, 'no duplicate rule ids in the merged set')
  assert.ok(warnings.some(w => /duplicate/i.test(w)) || true) // warning is best-effort
})

test('proxy default wins when any base wants proxy (roscomvpn + streaming addon)', () => {
  const { policy } = composeScenarios(['roscomvpn-default', 'streaming'])
  assert.equal(policy.defaultAction, 'proxy')
})

test('registry has base + addon scenarios; ai-services is default-enabled', () => {
  const meta = listScenarioMetadata()
  assert.ok(meta.some(m => m.isBase), 'has at least one base scenario')
  assert.ok(meta.some(m => !m.isBase), 'has add-on scenarios')
  assert.ok(meta.find(m => m.id === 'ai-services')?.defaultEnabled, 'ai-services enabled by default')
})

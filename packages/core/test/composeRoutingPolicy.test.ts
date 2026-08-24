import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// Same pattern as packages/config tests: the source pulls in @slave-vpn/routing
// (ESM-extensionless) → require the built CJS bundle (the test script builds first).
const require = createRequire(import.meta.url)

interface CustomRoutingRule {
  id: string
  domain: string
  matchType: 'suffix' | 'exact'
  action: 'proxy' | 'direct' | 'reject'
}
interface RuleShape {
  id: string
  target: { type: string; value: string }
  action: string
  priority: number
  source?: { provider?: string }
}
interface ResolveResult {
  policy: { defaultAction: string; rules: RuleShape[] } | null
  valid: boolean
}
const { resolveRoutingPolicyForMode } = require('../dist/cjs/index.js') as {
  resolveRoutingPolicyForMode: (
    mode: string,
    enabled: readonly string[],
    opts?: { customRules?: readonly CustomRoutingRule[]; splitProcesses?: readonly string[] },
  ) => ResolveResult
}

// «Свои правила» — user per-domain overrides. The contract these tests pin:
//  1. NO rules → the legacy paths are untouched (full/split policy stays null).
//  2. Rules exist → they sit ABOVE every scenario rule (priority band 50+ vs
//     scenarios' 100+), so a user override always wins.
//  3. full/split with rules → a minimal policy replicating the legacy MATCH
//     semantics (full=proxy; split: Windows direct+PROCESS, Android proxy).

const RULES: CustomRoutingRule[] = [
  { id: 'a', domain: '2ip.ru', matchType: 'suffix', action: 'proxy' },
  { id: 'b', domain: 'bank.ru', matchType: 'exact', action: 'direct' },
]

test('no custom rules → full/split keep policy null (legacy path untouched)', () => {
  for (const mode of ['full', 'split'] as const) {
    const r = resolveRoutingPolicyForMode(mode, [])
    assert.equal(r.policy, null, `${mode} must stay legacy with no rules`)
    assert.equal(r.valid, true)
  }
})

test('blocked mode: user rules outrank every scenario rule', () => {
  const r = resolveRoutingPolicyForMode('blocked', [], { customRules: RULES })
  assert.ok(r.policy, 'policy must compose')
  const rules = r.policy.rules
  const userIdx = rules.findIndex((x) => x.id === 'user:a')
  const firstScenarioIdx = rules.findIndex((x) => x.source?.provider?.startsWith('scenario:'))
  assert.ok(userIdx !== -1, 'user rule present')
  assert.ok(firstScenarioIdx !== -1, 'scenario rules present')
  assert.ok(userIdx < firstScenarioIdx, 'user rule sorted before scenario rules')
  // Priority band contract: user < 100 (private nets start at 100).
  assert.ok(rules[userIdx]!.priority < 100)
  // Match types map correctly.
  assert.equal(rules[userIdx]!.target.type, 'domain_suffix')
  const exact = rules.find((x) => x.id === 'user:b')
  assert.equal(exact?.target.type, 'domain')
  assert.equal(exact?.action, 'direct')
})

test('blocked mode: Gemini and its shared Google dependencies tunnel without proxying all Google', () => {
  const r = resolveRoutingPolicyForMode('blocked', [])
  assert.ok(r.policy, 'policy must compose')
  assert.equal(r.policy.defaultAction, 'direct', 'unmatched traffic must remain direct')

  for (const [type, value] of [
    ['geosite', 'google-gemini'],
    ['domain_suffix', 'accounts.google.com'],
    ['domain_suffix', 'www.googleapis.com'],
    ['domain_suffix', 'waa-pa.clients6.google.com'],
  ] as const) {
    const dependency = r.policy.rules.find(x => x.target.type === type && x.target.value === value)
    assert.equal(dependency?.action, 'proxy', `${type}:${value} must tunnel`)
    assert.equal(dependency?.source?.provider, 'scenario:ai-services')
  }

  assert.ok(
    !r.policy.rules.some(x => x.target.type === 'domain_suffix' && x.target.value === 'google.com'),
    'the rule must not proxy every Google service',
  )
})

test('bypass mode: user rules ride on roscomvpn-default (proxy default kept)', () => {
  const r = resolveRoutingPolicyForMode('bypass', [], { customRules: RULES })
  assert.ok(r.policy)
  assert.equal(r.policy.defaultAction, 'proxy')
  assert.ok(r.policy.rules.some((x) => x.id === 'user:a'))
})

test('full + rules → minimal policy: proxy default, private nets direct, user first', () => {
  const r = resolveRoutingPolicyForMode('full', [], { customRules: RULES })
  assert.ok(r.policy)
  assert.equal(r.policy.defaultAction, 'proxy')
  assert.equal(r.policy.rules[0]!.id, 'user:a', 'user rule first (priority 50)')
  assert.ok(
    r.policy.rules.some((x) => x.target.type === 'ip_cidr' && x.action === 'direct'),
    'private-net DIRECT rules present',
  )
})

test('split + rules: Windows (processes) → direct default + PROCESS first; Android → proxy default', () => {
  const win = resolveRoutingPolicyForMode('split', [], {
    customRules: RULES,
    splitProcesses: ['chrome.exe'],
  })
  assert.ok(win.policy)
  assert.equal(win.policy.defaultAction, 'direct')
  assert.equal(win.policy.rules[0]!.target.type, 'process_name', 'process allow-list first (legacy order)')
  assert.ok(win.policy.rules.some((x) => x.id === 'user:a'))

  const android = resolveRoutingPolicyForMode('split', [], { customRules: RULES })
  assert.ok(android.policy)
  assert.equal(android.policy.defaultAction, 'proxy', 'Android split keeps proxy-default (native app gating)')
  assert.ok(!android.policy.rules.some((x) => x.target.type === 'process_name'))
})

test('custom with zero scenarios + rules → proxy default (legacy custom semantics)', () => {
  const r = resolveRoutingPolicyForMode('custom', [], { customRules: RULES })
  assert.ok(r.policy)
  assert.equal(r.policy.defaultAction, 'proxy')
  assert.equal(r.policy.rules[0]!.id, 'user:a')
})

test('custom with scenarios + rules → user rules above the composed scenario set', () => {
  const r = resolveRoutingPolicyForMode('custom', ['roscomvpn-default', 'ai-services'], {
    customRules: RULES,
  })
  assert.ok(r.policy)
  const first = r.policy.rules[0]!
  assert.equal(first.id, 'user:a')
})

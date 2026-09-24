import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import yaml from 'js-yaml'
const require = createRequire(import.meta.url)
const { generateMihomoConfig } = require('../dist/cjs/index.js')
const { applyRealityCompatibility } = require('../dist/cjs/generator/realityCompatibility.js')

const proxy = (name: string) => ({ name, type: 'vless', server: 'example.invalid', port: 443,
  uuid: '00000000-0000-4000-8000-000000000000', tls: true, servername: 'cover.invalid',
  flow: 'xtls-rprx-vision', 'client-fingerprint': 'chrome',
  'reality-opts': { 'public-key': 'synthetic', 'short-id': 'a19c', 'mldsa65-verify': 'synthetic-pqv',
    'support-x25519mlkem768': true, 'fragment-client-hello': true } })
const context = { subscriptionYaml: yaml.dump({ proxies: [proxy('chosen'), proxy('other')] }),
  vpnMode: 'full', apiPort: 9090, apiSecret: 'test', utlsFingerprint: 'randomized',
  settings: { tunEnabled: false, tunStack: 'gvisor', fakeIpEnabled: false,
    dnsOverHttps: 'https://1.1.1.1/dns-query', fallbackDns: [], mixedPort: 7890 } }
const compile = (node?: string | null) => (yaml.load(generateMihomoConfig({ ...context,
  realityCompatibilityNode: node })) as { proxies: ReturnType<typeof proxy>[] }).proxies

test('explicit compatibility affects only its node and keeps classical authentication', () => {
  const before = compile()
  const after = compile('chosen')
  assert.deepEqual(after[1], before[1])
  const reality = after[0]['reality-opts']
  assert.equal(reality['mldsa65-verify'], undefined)
  assert.equal(reality['support-x25519mlkem768'], false)
  assert.equal(reality['fragment-client-hello'], false)
  assert.equal(reality['public-key'], 'synthetic')
  assert.equal(reality['short-id'], 'a19c')
  assert.equal(after[0].servername, 'cover.invalid')
  assert.equal(after[0].flow, 'xtls-rprx-vision')
  assert.equal(after[0]['client-fingerprint'], 'chrome')
  assert.deepEqual(compile(null), before, 'turning off restores original pqv and handshake options')
})

test('absent, empty and unknown compatibility node leave config unchanged', () => {
  assert.deepEqual(compile('missing'), compile())
  assert.deepEqual(compile(''), compile())
})

test('compatibility never mutates source and ignores other protocols or malformed options', () => {
  const original = proxy('chosen')
  const snapshot = structuredClone(original)
  applyRealityCompatibility([original], 'chosen')
  assert.deepEqual(original, snapshot)
  for (const other of [{ ...original, type: 'trojan' }, { ...original, 'reality-opts': null },
    { ...original, 'reality-opts': [] }]) {
    assert.deepEqual(applyRealityCompatibility([other], 'chosen'), [other])
  }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import yaml from 'js-yaml'
const require = createRequire(import.meta.url)
// generateMihomoConfig pulls in @slave-vpn/routing+dns (ESM-extensionless) →
// run it from the built CJS bundle, same as the sibling generator tests.
const { generateMihomoConfig, describeDamagedMldsa65Verify } = require('../dist/cjs/index.js')
const { sanitizeInvalidMldsa65Verify } = require('../dist/cjs/generator/sanitizeRealityMldsa65.js')

const VALID_PQV = 'A'.repeat(2603)
// The real-world damaged value observed in the wild: 2601 chars (len % 4 == 1,
// not even valid base64url — two characters lost somewhere in the copy chain).
const DAMAGED_PQV = 'B'.repeat(2601)

const proxy = (name: string, mldsa65Verify?: string) => ({ name, type: 'vless',
  server: 'example.invalid', port: 443, uuid: '00000000-0000-4000-8000-000000000000',
  tls: true, servername: 'cover.invalid', flow: 'xtls-rprx-vision', 'client-fingerprint': 'chrome',
  'reality-opts': { 'public-key': 'synthetic', 'short-id': 'a19c',
    ...(mldsa65Verify !== undefined ? { 'mldsa65-verify': mldsa65Verify } : {}),
    'support-x25519mlkem768': true, 'fragment-client-hello': true } })

test('sanitize strips only a damaged mldsa65-verify and keeps everything else', () => {
  const damaged = proxy('orel', DAMAGED_PQV)
  const { proxies, sanitized } = sanitizeInvalidMldsa65Verify([damaged, proxy('fine', VALID_PQV), proxy('none')])
  assert.deepEqual(sanitized, [{ name: 'orel', length: 2601 }])
  const reality = proxies[0]['reality-opts']
  assert.equal(reality['mldsa65-verify'], undefined)
  assert.equal(reality['public-key'], 'synthetic')
  assert.equal(reality['short-id'], 'a19c')
  assert.equal(reality['support-x25519mlkem768'], true)
  assert.equal(reality['fragment-client-hello'], true)
  assert.equal((proxies[1]['reality-opts'])['mldsa65-verify'], VALID_PQV)
  assert.ok(!(('mldsa65-verify') in (proxies[2]['reality-opts'])))
})

test('sanitize ignores non-vless nodes and malformed reality-opts', () => {
  const trojan = { ...proxy('t'), type: 'trojan' }
  const broken = [{ ...proxy('a'), 'reality-opts': null }, { ...proxy('b'), 'reality-opts': [] }]
  const { proxies, sanitized } = sanitizeInvalidMldsa65Verify([trojan, ...broken])
  assert.deepEqual(sanitized, [])
  assert.deepEqual(proxies, [trojan, ...broken])
})

test('generateMihomoConfig strips a damaged pqv node but keeps a valid one, and reports via callback', () => {
  const subscriptionYaml = yaml.dump({ proxies: [proxy('orel', DAMAGED_PQV), proxy('fine', VALID_PQV)] })
  const settings = { tunEnabled: false, tunStack: 'gvisor' as const, fakeIpEnabled: false,
    dnsOverHttps: 'https://1.1.1.1/dns-query', fallbackDns: [], mixedPort: 7890 }
  const reported: Array<{ name: string; length: number }> = []
  const out = yaml.load(generateMihomoConfig({ subscriptionYaml, vpnMode: 'full',
    apiPort: 9090, apiSecret: 'test', settings,
    onMldsa65Sanitized: (nodes: ReadonlyArray<{ name: string; length: number }>) => { reported.push(...nodes) },
  })) as { proxies: ReturnType<typeof proxy>[] }
  assert.deepEqual(reported, [{ name: 'orel', length: 2601 }])
  assert.equal(out.proxies[0]['reality-opts']['mldsa65-verify'], undefined, 'damaged key must not reach the core')
  assert.equal(out.proxies[0]['reality-opts']['public-key'], 'synthetic', 'classical REALITY auth is kept')
  assert.equal(out.proxies[1]['reality-opts']['mldsa65-verify'], VALID_PQV, 'valid key is preserved')
})

test('describeDamagedMldsa65Verify flags damaged links for import-time UI', () => {
  const warning = describeDamagedMldsa65Verify({ type: 'vless', extra: { 'reality-opts': proxy('orel', DAMAGED_PQV)['reality-opts'] } })
  assert.ok(warning && warning.includes('2601') && warning.includes('pqv'))
  assert.equal(describeDamagedMldsa65Verify({ type: 'vless', extra: { 'reality-opts': { 'mldsa65-verify': VALID_PQV } } }), null)
  assert.equal(describeDamagedMldsa65Verify({ type: 'vless', extra: {} }), null)
  assert.equal(describeDamagedMldsa65Verify({ type: 'trojan', extra: { 'reality-opts': { 'mldsa65-verify': DAMAGED_PQV } } }), null)
})

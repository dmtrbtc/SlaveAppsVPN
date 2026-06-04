import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// generateMihomoConfig pulls in @slave-vpn/routing+dns (ESM-extensionless) →
// require the built CJS bundle (the `test` script builds first).
const require = createRequire(import.meta.url)
const { generateMihomoConfig } = require('../dist/cjs/index.js') as {
  generateMihomoConfig: (ctx: unknown) => string
}

const SUB = `
proxies:
  - { name: NL, type: vless, server: nl.example.online, port: 443, uuid: 00000000-0000-4000-8000-000000000000, tls: true, servername: nl.example.online, flow: xtls-rprx-vision, reality-opts: { public-key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, short-id: 0123456789abcdef } }
`.trim()

function gen(mode: 'smart' | 'global' | 'direct'): string {
  return generateMihomoConfig({
    subscriptionYaml: SUB,
    vpnMode: 'full',
    settings: { tunEnabled: false, tunStack: 'gvisor', fakeIpEnabled: true, dnsOverHttps: 'https://cloudflare-dns.com/dns-query', fallbackDns: ['8.8.8.8'], mixedPort: 7890 },
    apiPort: 9090, apiSecret: 'x', utlsFingerprint: 'randomized',
    androidRouting: {
      mode,
      nodeDomainSuffixes: ['nl.example.online'],
      geoEnabled: true,
      bypassProviders: [{ name: 'bypass-domains', behavior: 'domain', url: 'https://example/list.lst', path: './rules/b.list' }],
    },
  })
}

test('smart mode: rules ordered — node DIRECT, bypass BEFORE GEOSITE:RU, MATCH last', () => {
  const out = gen('smart')
  const rules: string[] = JSON.parse(JSON.stringify(require('js-yaml').load(out).rules))
  const idxNode = rules.findIndex(r => r.startsWith('DOMAIN-SUFFIX,nl.example.online,DIRECT'))
  const idxBypass = rules.findIndex(r => r.includes('RULE-SET,bypass-domains,SLAVE-SELECT'))
  const idxGeoRu = rules.findIndex(r => r.includes('GEOSITE,category-ru,DIRECT'))
  const idxMatch = rules.findIndex(r => r === 'MATCH,SLAVE-SELECT')
  assert.ok(idxNode === 0, 'node DIRECT must be first')
  assert.ok(idxBypass >= 0 && idxGeoRu >= 0, 'bypass + GEOSITE:RU present')
  assert.ok(idxBypass < idxGeoRu, 'bypass (blocked→VPN) MUST come before GEOSITE:RU (→DIRECT)')
  assert.ok(idxMatch === rules.length - 1, 'MATCH must be last')
})

test('smart mode: hardened DNS (DoH-only pool, proxy-server-nameserver, no plaintext nameserver)', () => {
  const doc = require('js-yaml').load(gen('smart')) as { dns: Record<string, unknown> }
  assert.equal(doc.dns['respect-rules'], true)
  assert.equal(doc.dns['prefer-h3'], false, 'h3 (QUIC) disabled so DoH stays on TCP/443')
  const ns = doc.dns['nameserver'] as string[]
  assert.ok(Array.isArray(ns) && ns.length >= 2, 'nameserver is a DoH pool (>=2)')
  assert.ok(ns.every(s => s.startsWith('https://')), 'main nameserver pool MUST be DoH-only (no plaintext)')
  assert.ok(ns.some(s => s.includes('dns.google')), 'Google DoH present in pool')
  assert.ok(Array.isArray(doc.dns['proxy-server-nameserver']))
})

test('smart mode: DNS nameserver-policy — RU TLDs direct + node domains resolved directly', () => {
  const doc = require('js-yaml').load(gen('smart')) as { dns: Record<string, unknown> }
  const policy = doc.dns['nameserver-policy'] as Record<string, unknown>
  assert.deepEqual(policy['+.ru'], ['77.88.8.8', '8.8.8.8'], '+.ru → Yandex+Google direct')
  assert.deepEqual(policy['+.рф'], ['77.88.8.8', '8.8.8.8'], '+.рф → Yandex+Google direct')
  // node domain resolved directly (before tunnel) to real IPs
  assert.deepEqual(policy['+.nl.example.online'], ['system', '8.8.8.8'], 'node domain → direct system/Google')
})

test('autobalancer: SLAVE-AUTO is url-test with tolerance:50 + lazy:true', () => {
  const doc = require('js-yaml').load(gen('smart')) as { 'proxy-groups': Array<Record<string, unknown>> }
  const auto = doc['proxy-groups'].find(g => g['name'] === 'SLAVE-AUTO')
  assert.ok(auto, 'SLAVE-AUTO group present')
  assert.equal(auto!['type'], 'url-test')
  assert.equal(auto!['tolerance'], 50)
  assert.equal(auto!['lazy'], true)
  assert.equal(auto!['interval'], 300)
})

test('global mode → mode:global + MATCH proxy; direct mode → mode:direct + MATCH direct', () => {
  const g = require('js-yaml').load(gen('global')) as { mode: string; rules: string[] }
  assert.equal(g.mode, 'global')
  assert.equal(g.rules[g.rules.length - 1], 'MATCH,SLAVE-SELECT')
  const d = require('js-yaml').load(gen('direct')) as { mode: string; rules: string[] }
  assert.equal(d.mode, 'direct')
  assert.ok(d.rules.includes('MATCH,DIRECT'))
})

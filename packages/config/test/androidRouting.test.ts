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

test('smart mode: hardened DNS (DoH, proxy-server-nameserver, no plaintext nameserver)', () => {
  const doc = require('js-yaml').load(gen('smart')) as { dns: Record<string, unknown> }
  assert.equal(doc.dns['respect-rules'], true)
  assert.ok(Array.isArray(doc.dns['proxy-server-nameserver']))
  assert.ok(!JSON.stringify(doc.dns['nameserver']).includes('8.8.8.8'), 'nameserver must not contain plaintext 8.8.8.8')
})

test('global mode → mode:global + MATCH proxy; direct mode → mode:direct + MATCH direct', () => {
  const g = require('js-yaml').load(gen('global')) as { mode: string; rules: string[] }
  assert.equal(g.mode, 'global')
  assert.equal(g.rules[g.rules.length - 1], 'MATCH,SLAVE-SELECT')
  const d = require('js-yaml').load(gen('direct')) as { mode: string; rules: string[] }
  assert.equal(d.mode, 'direct')
  assert.ok(d.rules.includes('MATCH,DIRECT'))
})

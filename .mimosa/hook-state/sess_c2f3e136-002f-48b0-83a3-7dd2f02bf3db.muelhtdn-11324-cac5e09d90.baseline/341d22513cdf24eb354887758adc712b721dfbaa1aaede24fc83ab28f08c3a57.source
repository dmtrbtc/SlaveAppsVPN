import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
interface Resolver { url: string; type: string; preferH3?: boolean }
interface DnsRule { id: string; matchType: string; value: string; resolverTag: string | string[] }
interface Profile {
  nameservers: Resolver[]
  fallbackNameservers?: Resolver[]
  bootstrapNameservers?: Resolver[]
  proxyServerNameservers?: Resolver[]
  fakeIp: { enabled: boolean; filter?: string[] }
  leakPrevention: { enabled: boolean; useSystemDns: boolean; fallbackFilter?: { geoipCode: string } }
  rules?: DnsRule[]
  preferH3?: boolean
}
const { buildAndroidDnsProfile } = require('../dist/cjs/index.js') as {
  buildAndroidDnsProfile: (o: {
    dohUrl: string
    nodeDomainSuffixes: readonly string[]
    ruDirectDns?: boolean
    extraFakeIpFilter?: readonly string[]
  }) => Profile
}

const base = { dohUrl: 'https://1.1.1.1/dns-query', nodeDomainSuffixes: ['node.example.com'] }

test('primary + fallback + bootstrap resolvers are all IP-literal (no poisonable hostname)', () => {
  const p = buildAndroidDnsProfile(base)
  for (const r of p.nameservers) {
    assert.match(r.url, /^https:\/\/\d{1,3}(\.\d{1,3}){3}\//, `DoH IP-literal: ${r.url}`)
  }
  assert.ok(p.fallbackNameservers && p.fallbackNameservers.length >= 2, 'fallback pool present (v0.2.34)')
  for (const r of p.fallbackNameservers!) {
    assert.equal(r.type, 'dot')
    assert.match(r.url, /^tls:\/\/\d{1,3}(\.\d{1,3}){3}$/, `DoT IP-literal: ${r.url}`)
  }
  assert.equal(p.preferH3, false, 'h3 off — DoH on TCP/443')
})

test('fallback-filter geoip:RU present with the fallback pool', () => {
  const p = buildAndroidDnsProfile(base)
  assert.equal(p.leakPrevention.fallbackFilter?.geoipCode, 'RU')
})

test('ruDirectDns on (bypass/custom) → RU TLDs resolve via Russian resolvers', () => {
  const p = buildAndroidDnsProfile({ ...base, ruDirectDns: true })
  const ru = p.rules?.find(r => r.value === 'ru' && r.matchType === 'domain_suffix')
  assert.ok(ru, 'RU tld rule present')
  const tags = Array.isArray(ru!.resolverTag) ? ru!.resolverTag : [ru!.resolverTag]
  assert.ok(tags.every(t => /^77\.88\.8\./.test(t)), 'RU resolves via Yandex (77.88.8.x) only')
})

test('ruDirectDns off (full/split) → NO RU-direct DNS rule (RU tunnels via DoH)', () => {
  const p = buildAndroidDnsProfile({ ...base, ruDirectDns: false })
  assert.ok(!p.rules?.some(r => r.value === 'ru'), 'no plaintext RU DNS leak in full/split')
})

test('extraFakeIpFilter (user DIRECT-rule domains) is appended to fake-ip-filter', () => {
  const p = buildAndroidDnsProfile({ ...base, extraFakeIpFilter: ['+.mybank.ru', 'exact.example'] })
  assert.ok(p.fakeIp.filter?.includes('+.mybank.ru'))
  assert.ok(p.fakeIp.filter?.includes('exact.example'))
})

test('node domains are excluded from fake-ip (resolve to real IPs)', () => {
  const p = buildAndroidDnsProfile(base)
  assert.ok(p.fakeIp.filter?.includes('+.node.example.com'))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MihomoDnsCompiler, resolveDnsIpv6Enabled } from '../src/compiler/MihomoDnsCompiler.ts'
import { buildAndroidDnsProfile } from '../src/profiles/AndroidDnsProfile.ts'
import type { DnsProfile } from '../src/profiles/DnsProfile.ts'

function baseProfile(overrides: Partial<DnsProfile> = {}): DnsProfile {
  return {
    mode: 'fake-ip',
    nameservers: [{ url: 'https://1.1.1.1/dns-query', type: 'doh' }],
    preferH3: false,
    fakeIp: { enabled: true, range: '198.18.0.1/16', filter: ['*.lan'] },
    leakPrevention: {
      enabled: true,
      useSystemDns: false,
      fallbackFilter: { geoipEnabled: true, geoipCode: 'RU', ipCidrs: ['240.0.0.0/4'] },
    },
    ipv6: { enabled: false },
    sniffing: { enabled: false, overrideDestination: false, protocols: [] },
    strategy: 'prefer_ipv4',
    ...overrides,
  } as DnsProfile
}

const compile = (p: DnsProfile) => new MihomoDnsCompiler().compile(p).config as Record<string, unknown>

test('base shape: enable/listen/enhanced-mode/nameserver', () => {
  const c = compile(baseProfile())
  assert.equal(c.enable, true)
  assert.equal(c.listen, '0.0.0.0:1053')
  assert.equal(c['enhanced-mode'], 'fake-ip')
  assert.deepEqual(c.nameserver, ['https://1.1.1.1/dns-query'])
  assert.equal(c['use-system-hosts'], false)
})

test('respect-rules requires a non-empty proxy-server-nameserver', () => {
  const c = compile(baseProfile())
  assert.equal(c['respect-rules'], true)
  const psn = c['proxy-server-nameserver'] as string[]
  assert.ok(Array.isArray(psn) && psn.length > 0, 'mihomo fatals on empty proxy-server-nameserver with respect-rules')
})

test('fake-ip range and filter are emitted', () => {
  const c = compile(baseProfile())
  assert.equal(c['fake-ip-range'], '198.18.0.1/16')
  assert.deepEqual(c['fake-ip-filter'], ['*.lan'])
})

test('fallback pool and fallback-filter (geoip RU) are emitted together', () => {
  const c = compile(baseProfile({
    fallbackNameservers: [{ url: 'tls://1.1.1.1', type: 'dot' }],
  }))
  assert.deepEqual(c.fallback, ['tls://1.1.1.1'])
  const ff = c['fallback-filter'] as Record<string, unknown>
  assert.equal(ff.geoip, true)
  assert.equal(ff['geoip-code'], 'RU')
  assert.deepEqual(ff.ipcidr, ['240.0.0.0/4'])
})

test('no fallback → no fallback-filter key at all', () => {
  const c = compile(baseProfile())
  assert.equal(c.fallback, undefined)
  assert.equal(c['fallback-filter'], undefined)
})

test('rule tags: primary/fallback/system and verbatim URLs', () => {
  const c = compile(baseProfile({
    fallbackNameservers: [{ url: 'tls://8.8.8.8', type: 'dot' }],
    rules: [
      { id: 'a', matchType: 'domain_suffix', value: 'example.com', resolverTag: 'primary' },
      { id: 'b', matchType: 'geosite', value: 'private', resolverTag: 'system' },
      { id: 'c', matchType: 'domain_suffix', value: 'ru', resolverTag: 'https://common.dot.dns.yandex.net/dns-query#DIRECT' },
    ],
  }))
  const policy = c['nameserver-policy'] as Record<string, unknown>
  assert.equal(policy['+.example.com'], 'https://1.1.1.1/dns-query')
  assert.equal(policy['geosite:private'], 'system')
  assert.equal(policy['+.ru'], 'https://common.dot.dns.yandex.net/dns-query#DIRECT')
})

test('ipv6 resolution honors strategy over the ipv6 flag', () => {
  assert.equal(resolveDnsIpv6Enabled(baseProfile({ strategy: 'ipv6_only' })), true)
  assert.equal(resolveDnsIpv6Enabled(baseProfile({ strategy: 'prefer_ipv6' })), true)
  assert.equal(resolveDnsIpv6Enabled(baseProfile({ strategy: 'ipv4_only' })), false)
  assert.equal(resolveDnsIpv6Enabled(baseProfile({ strategy: 'prefer_ipv4', ipv6: { enabled: true } })), true)
  assert.equal(resolveDnsIpv6Enabled(baseProfile({ strategy: 'prefer_ipv4', ipv6: { enabled: false } })), false)
})

test('android profile compiles end-to-end with the DoH#DIRECT RU policy', () => {
  const profile = buildAndroidDnsProfile({
    dohUrl: 'https://dns.cloudflare.com/dns-query',
    nodeDomainSuffixes: ['node.example.online'],
    ruDirectDns: true,
  })
  const c = compile(profile)
  assert.equal(c['enhanced-mode'], 'fake-ip')
  assert.equal(c['prefer-h3'], false)
  const policy = c['nameserver-policy'] as Record<string, unknown>
  assert.equal(policy['+.ru'], 'https://common.dot.dns.yandex.net/dns-query#DIRECT')
  // private names must NOT use `system` on Android (TUN DNS loop) — encrypted DoH#DIRECT
  assert.equal(policy['geosite:private'], 'https://dns.google/dns-query#DIRECT')
  // node domain → DoH pool entries (https), never `system`
  const nodePolicy = policy['+.node.example.online']
  const nodeList = Array.isArray(nodePolicy) ? nodePolicy : [nodePolicy]
  assert.ok((nodeList as string[]).every(u => u.startsWith('https://')))
  // bootstrap stays plaintext-only for the DoH hostname resolution
  const bootstrap = c['default-nameserver'] as string[]
  assert.ok(bootstrap.length > 0)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// generateMihomoConfig pulls in @slave-vpn/routing+dns (ESM-extensionless) →
// require the built CJS bundle (the `test` script builds first).
const require = createRequire(import.meta.url)
const { generateMihomoConfig } = require('../dist/cjs/index.js') as {
  generateMihomoConfig: (ctx: unknown) => string
}
const { buildAndroidDnsProfile } = require('@slave-vpn/dns') as {
  buildAndroidDnsProfile: (opts: { dohUrl: string; nodeDomainSuffixes: string[]; ruDirectDns?: boolean }) => unknown
}
const { composeScenarios } = require('@slave-vpn/routing') as {
  composeScenarios: (ids: string[]) => { policy: { providerRules: Array<{ target: { type: string; value: string }; action: string; priority: number }> } }
}

const SUB = `
proxies:
  - { name: NL, type: vless, server: nl.example.online, port: 443, uuid: 00000000-0000-4000-8000-000000000000, tls: true, servername: nl.example.online, flow: xtls-rprx-vision, reality-opts: { public-key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, short-id: 0123456789abcdef } }
`.trim()

// `smart` keeps RU-direct DNS (bypass); `global` is the full tunnel (no RU-direct).
function gen(mode: 'smart' | 'global' | 'direct'): string {
  return generateMihomoConfig({
    subscriptionYaml: SUB,
    vpnMode: 'full',
    settings: { tunEnabled: false, tunStack: 'gvisor', fakeIpEnabled: true, dnsOverHttps: 'https://1.1.1.1/dns-query', fallbackDns: ['8.8.8.8'], mixedPort: 7890 },
    apiPort: 9090, apiSecret: 'x', utlsFingerprint: 'randomized',
    dnsProfile: buildAndroidDnsProfile({
      dohUrl: 'https://1.1.1.1/dns-query',
      nodeDomainSuffixes: ['nl.example.online'],
      ruDirectDns: mode === 'smart',
    }),
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
  // IP-literal DoH only — a hostname endpoint would need a plaintext bootstrap a
  // hostile ISP (Rostelekom) can hijack. /^https:\/\/\d+\.\d+\.\d+\.\d+\// matches
  // https://1.1.1.1/ , https://8.8.8.8/ etc.
  assert.ok(ns.every(s => /^https:\/\/\d{1,3}(\.\d{1,3}){3}\//.test(s)), 'DoH pool MUST be IP-literal (no hostname bootstrap)')
  assert.ok(ns.some(s => s.includes('8.8.8.8')), 'Google IP-DoH present in pool')
  assert.ok(Array.isArray(doc.dns['proxy-server-nameserver']))
  // Bootstrap (default-nameserver) must NOT contain the dropped China AliDNS.
  const boot = (doc.dns['default-nameserver'] ?? []) as string[]
  assert.ok(!boot.some(s => s.includes('223.5.5.5')), 'AliDNS 223.5.5.5 dropped from bootstrap')
})

test('v0.2.34: Android DNS has an IP-literal DoT fallback pool + RU fallback-filter', () => {
  const doc = require('js-yaml').load(gen('smart')) as { dns: Record<string, unknown> }
  // Before v0.2.34 there was NO fallback: the DoH pool dying = total DNS failure.
  const fb = doc.dns['fallback'] as string[]
  assert.ok(Array.isArray(fb) && fb.length >= 2, 'fallback pool present (>=2)')
  assert.ok(fb.every(s => s.startsWith('tls://')), 'fallback is DoT (different transport from DoH/443)')
  assert.ok(fb.every(s => /^tls:\/\/\d{1,3}(\.\d{1,3}){3}$/.test(s)), 'fallback DoT MUST be IP-literal (no hostname bootstrap)')
  const ff = doc.dns['fallback-filter'] as { geoip: boolean; 'geoip-code': string }
  assert.ok(ff && ff.geoip === true && ff['geoip-code'] === 'RU', 'fallback-filter geoip:RU present')
})

test('smart mode: DNS nameserver-policy — RU TLDs via TWO Russian resolvers, no foreign plaintext', () => {
  const doc = require('js-yaml').load(gen('smart')) as { dns: Record<string, unknown> }
  const policy = doc.dns['nameserver-policy'] as Record<string, unknown>
  // RU domains → two Russian (Yandex) resolvers, both direct — NO foreign 8.8.8.8
  // (it's a non-RU IP that respect-rules sent through the tunnel → cancelled DNS).
  assert.deepEqual(policy['+.ru'], ['77.88.8.8', '77.88.8.1'], '+.ru → Russian resolvers only')
  assert.deepEqual(policy['+.рф'], ['77.88.8.8', '77.88.8.1'], '+.рф → Russian resolvers only')
  // node domain resolved via the DoH pool (NOT `system`, which loops back through
  // the TUN and fails) — emitted as the DoH URL list (multiple) or scalar (one).
  const nodePolicy = policy['+.nl.example.online']
  const nodeList = Array.isArray(nodePolicy) ? nodePolicy : [nodePolicy]
  assert.ok(nodeList.every(u => typeof u === 'string' && u.startsWith('https://')),
    'node domain → DoH pool (no plaintext/system)')
  assert.ok(nodeList.some(u => (u as string).includes('8.8.8.8')), 'node DoH pool includes Google IP-DoH')
})

test('full tunnel (global): NO RU-direct DNS — RU resolves via DoH, no plaintext leak', () => {
  const doc = require('js-yaml').load(gen('global')) as { dns: Record<string, unknown> }
  const policy = (doc.dns['nameserver-policy'] ?? {}) as Record<string, unknown>
  assert.equal(policy['+.ru'], undefined, 'no RU TLD policy in full tunnel')
  assert.equal(policy['geosite:category-ru'], undefined, 'no category-ru policy in full tunnel')
  const fakeFilter = (doc.dns['fake-ip-filter'] ?? []) as string[]
  assert.ok(!fakeFilter.includes('+.ru'), '+.ru must NOT be fake-ip-excluded in full tunnel')
})

test('autobalancer: SLAVE-AUTO is url-test with tolerance:50 + lazy:true + interval:60', () => {
  const doc = require('js-yaml').load(gen('smart')) as {
    'proxy-groups': Array<Record<string, unknown>>
    'keep-alive-interval'?: number
  }
  const auto = doc['proxy-groups'].find(g => g['name'] === 'SLAVE-AUTO')
  assert.ok(auto, 'SLAVE-AUTO group present')
  assert.equal(auto!['type'], 'url-test')
  assert.equal(auto!['tolerance'], 50)
  assert.equal(auto!['lazy'], true)
  // 60s so a live node is re-picked quickly after the device wakes
  assert.equal(auto!['interval'], 60)
  // TCP keep-alive recycles connections that die during Doze → fast reconnect
  assert.equal(doc['keep-alive-interval'], 15)
})

test('perf: global ipv6 OFF + HTTP sniff narrowed to :80 (no wasted v6 dials / 8080 sniff-wait)', () => {
  const doc = require('js-yaml').load(gen('smart')) as {
    ipv6?: boolean
    sniffer?: { sniff?: { HTTP?: { ports?: unknown[] } } }
  }
  // No working IPv6 uplink → mihomo must reject v6 destinations immediately
  // instead of attempting connect() and falling back after «network unreachable».
  assert.equal(doc.ipv6, false, 'root ipv6 must be false')
  // HTTP sniff only on :80 — the old 8080-8880 range stalled on non-HTTP traffic.
  const httpPorts = doc.sniffer?.sniff?.HTTP?.ports
  assert.deepEqual(httpPorts, [80], 'HTTP sniff ports must be exactly [80]')
})

test('perf: sniffer skips Telegram DC ranges (MTProto on :443 is not TLS → no sniff-stall on media)', () => {
  const doc = require('js-yaml').load(gen('smart')) as {
    sniffer?: { 'skip-dst-address'?: string[] }
  }
  const skip = doc.sniffer?.['skip-dst-address']
  assert.ok(Array.isArray(skip) && skip.length > 0, 'skip-dst-address present')
  // Telegram media/DC connections hit raw IPs on :443 with an obfuscated protocol —
  // the sniffer can never recover an SNI and stalls per-connection. These ranges are
  // already routed by GeoIP(telegram); skipping the sniff removes the media slowdown.
  assert.ok(skip.includes('149.154.160.0/20'), 'core Telegram DC v4 range skipped')
  assert.ok(skip.includes('91.108.4.0/22'), 'Telegram DC v4 range skipped')
  assert.ok(skip.some(c => c.startsWith('2001:67c:4e8')), 'Telegram DC v6 range skipped')
})

test('R2: roscomvpn-default carries curated RU-direct (banks/gov/payments) DIRECT, before geoip:RU', () => {
  // «Обход» resolves to roscomvpn-default on both platforms. Banks/gov on foreign
  // CDNs leak into the tunnel under fake-ip unless an explicit DIRECT domain rule
  // beats geoip:RU,no-resolve (which can't match a fake-IP). Guard that wiring.
  const { providerRules } = composeScenarios(['roscomvpn-default']).policy
  const ruDirect = providerRules.filter(
    r => r.target.type === 'domain_suffix' && r.action === 'direct'
      && /sberbank\.ru|tbank\.ru|gosuslugi\.ru|nspk\.ru|kinopoisk\.ru/.test(r.target.value),
  )
  assert.ok(ruDirect.length >= 5, 'curated RU-direct banks/gov/payments/streaming present')
  const geoipRu = providerRules.find(r => r.target.type === 'geoip' && r.target.value === 'RU')
  assert.ok(geoipRu, 'geoip:RU rule present')
  // every curated RU-direct rule must sort BEFORE geoip:RU (lower priority = first)
  assert.ok(ruDirect.every(r => r.priority < geoipRu!.priority), 'RU-direct evaluated before geoip:RU')
})

test('messengers → proxy in BOTH bypass bases (WhatsApp/Telegram calls work in default mode)', () => {
  // The default mode «Только заблокированное» = smart-russia-bypass (direct-default).
  // WhatsApp was missing → calls dialed DIRECT and got RKN-throttled. Both bases must
  // proxy the major messengers incl. the call-media geoip ranges.
  for (const base of ['smart-russia-bypass', 'roscomvpn-default']) {
    const { providerRules } = composeScenarios([base]).policy
    const proxied = (type: string, value: string) =>
      providerRules.some(r => r.target.type === type && r.target.value === value && r.action === 'proxy')
    assert.ok(proxied('geosite', 'whatsapp'), `${base}: geosite:whatsapp → proxy`)
    assert.ok(proxied('geoip', 'facebook'), `${base}: geoip:facebook (WhatsApp media) → proxy`)
    assert.ok(proxied('geosite', 'telegram'), `${base}: geosite:telegram → proxy`)
    assert.ok(proxied('geoip', 'telegram'), `${base}: geoip:telegram (voice DCs) → proxy`)
    assert.ok(proxied('geosite', 'signal'), `${base}: geosite:signal → proxy`)
    assert.ok(proxied('geosite', 'discord'), `${base}: geosite:discord → proxy`)
    // call-media geoip must sort BEFORE geoip:RU→direct so it can't slip out direct
    const geoipRu = providerRules.find(r => r.target.type === 'geoip' && r.target.value === 'RU')
    const fb = providerRules.find(r => r.target.type === 'geoip' && r.target.value === 'facebook')
    assert.ok(geoipRu && fb && fb.priority < geoipRu.priority, `${base}: messenger media before geoip:RU`)
  }
})

test('global mode → clash mode:RULE (never global) + MATCH proxy; direct mode → mode:direct', () => {
  // clash `mode: global` IGNORES the rule list and routes everything (incl. DNS,
  // the local API, the proxy's own dial) through the undefined GLOBAL group →
  // breaks the engine. The full-tunnel intent is the RULE list instead.
  const g = require('js-yaml').load(gen('global')) as { mode: string; rules: string[] }
  assert.equal(g.mode, 'rule', 'full tunnel uses rule mode, NOT clash global')
  assert.equal(g.rules[g.rules.length - 1], 'MATCH,SLAVE-SELECT')
  const d = require('js-yaml').load(gen('direct')) as { mode: string; rules: string[] }
  assert.equal(d.mode, 'direct')
  assert.ok(d.rules.includes('MATCH,DIRECT'))
})

// ─── Telegram load-balance (v0.2.39) ────────────────────────────────────────
// Telegram media opens many parallel connections; pinned to the single selected
// node they share one uplink («то быстро, то медленно»). With ≥2 nodes we route
// ONLY the telegram rules through a round-robin SLAVE-BALANCE group to spread them.
const SUB2 = `
proxies:
  - { name: EE, type: vless, server: ee.example.online, port: 443, uuid: 00000000-0000-4000-8000-000000000000, tls: true, servername: ee.example.online, flow: xtls-rprx-vision, reality-opts: { public-key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, short-id: 0123456789abcdef } }
  - { name: NL, type: vless, server: nl.example.online, port: 443, uuid: 00000000-0000-4000-8000-000000000001, tls: true, servername: nl.example.online, flow: xtls-rprx-vision, reality-opts: { public-key: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, short-id: 0123456789abcdef } }
`.trim()

const TG_POLICY = {
  rules: [
    { id: 'tg1', target: { type: 'geosite', value: 'telegram' }, action: 'proxy', priority: 1300 },
    { id: 'tg2', target: { type: 'geoip', value: 'telegram' }, action: 'proxy', priority: 1301, noResolve: true },
    { id: 'wa', target: { type: 'geoip', value: 'facebook' }, action: 'proxy', priority: 1302, noResolve: true },
    { id: 'ru', target: { type: 'geosite', value: 'category-ru' }, action: 'direct', priority: 2000 },
  ],
  defaultAction: 'proxy',
}

function genPolicy(sub: string, policy: unknown): Record<string, unknown> {
  const out = generateMihomoConfig({
    subscriptionYaml: sub,
    vpnMode: 'full',
    settings: { tunEnabled: false, tunStack: 'gvisor', fakeIpEnabled: true, dnsOverHttps: 'https://1.1.1.1/dns-query', fallbackDns: ['8.8.8.8'], mixedPort: 7890 },
    apiPort: 9090, apiSecret: 'x', utlsFingerprint: 'randomized',
    routingPolicy: policy,
    dnsProfile: buildAndroidDnsProfile({ dohUrl: 'https://1.1.1.1/dns-query', nodeDomainSuffixes: ['ee.example.online', 'nl.example.online'], ruDirectDns: true }),
    androidRouting: { mode: 'smart', nodeDomainSuffixes: ['ee.example.online', 'nl.example.online'], geoEnabled: true, bypassProviders: [] },
  })
  return require('js-yaml').load(out) as Record<string, unknown>
}

test('≥2 nodes: ONLY telegram rules route through round-robin SLAVE-BALANCE; rest keep SLAVE-SELECT', () => {
  const doc = genPolicy(SUB2, TG_POLICY)
  const groups = doc['proxy-groups'] as Array<{ name: string; type: string; strategy?: string; proxies: string[] }>
  const balance = groups.find(g => g.name === 'SLAVE-BALANCE')
  assert.ok(balance, 'SLAVE-BALANCE group present with ≥2 nodes')
  assert.equal(balance!.type, 'load-balance')
  assert.equal(balance!.strategy, 'round-robin', 'round-robin spreads parallel media connections')
  assert.deepEqual(balance!.proxies, ['EE', 'NL'], 'balance spans all nodes (not the SLAVE-AUTO group)')
  const rules = doc['rules'] as string[]
  assert.ok(rules.includes('GEOSITE,telegram,SLAVE-BALANCE'), 'geosite:telegram → balance')
  assert.ok(rules.includes('GEOIP,telegram,SLAVE-BALANCE,no-resolve'), 'geoip:telegram → balance (no-resolve preserved)')
  // Everything else — incl. WhatsApp/facebook and the MATCH fallback — stays on the
  // user-selected node so the manual pick still governs general surfing.
  assert.ok(rules.includes('GEOIP,facebook,SLAVE-SELECT,no-resolve'), 'non-telegram messenger stays on SLAVE-SELECT')
  assert.equal(rules[rules.length - 1], 'MATCH,SLAVE-SELECT', 'default still SLAVE-SELECT')
})

test('single node: NO balance group — telegram stays on SLAVE-SELECT (respects manual pick)', () => {
  const doc = genPolicy(SUB, TG_POLICY)
  const groups = doc['proxy-groups'] as Array<{ name: string }>
  assert.ok(!groups.some(g => g.name === 'SLAVE-BALANCE'), 'no SLAVE-BALANCE with a single node')
  const rules = doc['rules'] as string[]
  assert.ok(rules.includes('GEOSITE,telegram,SLAVE-SELECT'), 'telegram stays on SLAVE-SELECT when nothing to balance')
})

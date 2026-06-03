import yaml from 'js-yaml'
import type { VPNMode } from '@slave-vpn/shared'
import type { NormalizedPolicy } from '@slave-vpn/routing'
import { MihomoRuleCompiler } from '@slave-vpn/routing'
import type { DnsProfile } from '@slave-vpn/dns'
import { MihomoDnsCompiler } from '@slave-vpn/dns'
import { SubscriptionParser } from '../parser/SubscriptionParser'
import type { ParsedProxy, ParsedProxyGroup } from '../parser/ParsedProfile'
import { applyUtlsRotation, type UtlsFingerprint } from '../utls/applyUtlsRotation'

export interface GeneratorSettings {
  tunEnabled: boolean
  tunStack: 'mixed' | 'gvisor' | 'system'
  fakeIpEnabled: boolean
  dnsOverHttps: string
  fallbackDns: string[]
  mixedPort: number
  splitTunnelProcesses?: string[]
}

export type AndroidRoutingMode = 'smart' | 'global' | 'direct'

export interface AndroidBypassProvider {
  name: string
  behavior: 'domain' | 'ipcidr'
  url: string
  /** relative path under the working dir where mihomo caches the list */
  path: string
}

/**
 * Android "smart" routing (RU split tunnelling). When set, generateMihomoConfig
 * emits an ordered rule list (node domains DIRECT → bypass/RKN-blocked through
 * the VPN → private/RU IPs+domains DIRECT → everything else through the VPN),
 * auto-downloading geo databases and the bypass rule-providers. Unset = the
 * legacy single-MATCH behavior (Windows).
 */
export interface AndroidRoutingOptions {
  mode: AndroidRoutingMode
  /** Domain suffixes of the proxy nodes → DIRECT (anti-loop). e.g. ['slave-apps.online'] */
  nodeDomainSuffixes: string[]
  /** External rule-providers for RKN-blocked sites → routed through the VPN. */
  bypassProviders: AndroidBypassProvider[]
  /** geox-url for auto-downloaded GeoIP.dat/GeoSite.dat (RU geo rules). */
  geoEnabled: boolean
}

export interface ConfigGenerationContext {
  subscriptionYaml: string
  selectedProxy?: string
  vpnMode: VPNMode
  settings: GeneratorSettings
  androidRouting?: AndroidRoutingOptions
  apiPort: number
  apiSecret: string
  routingPolicy?: NormalizedPolicy
  dnsProfile?: DnsProfile
  // Absolute path to geo databases directory (geoip.dat/geosite.dat for mihomo,
  // geoip.db/geosite.db for sing-box). When unset, engines fall back to
  // working dir + may attempt auto-download.
  rulesDir?: string
  // uTLS fingerprint to apply to every TLS-enabled outbound. When unset,
  // generators default to "randomized" (and only override the static "chrome"
  // default — leaving provider-set explicit fingerprints alone). When set
  // explicitly, the value is forced onto every proxy.
  utlsFingerprint?: string
}

const SLAVE_SELECT_GROUP = 'SLAVE-SELECT'
const SLAVE_AUTO_GROUP = 'SLAVE-AUTO'
const URL_TEST_URL = 'http://www.gstatic.com/generate_204'
const URL_TEST_INTERVAL = 300

const dnsCompiler = new MihomoDnsCompiler()
const ruleCompiler = new MihomoRuleCompiler()

export function generateMihomoConfig(ctx: ConfigGenerationContext): string {
  const parser = new SubscriptionParser()
  const profile = parser.parse(ctx.subscriptionYaml)

  // uTLS rotation — same logic as the sing-box compiler. Mihomo passes the
  // proxies through to its YAML output untouched, so we rewrite the
  // client-fingerprint field on each parsed proxy before emit.
  const rotatedProxies = applyUtlsRotation(profile.proxies, {
    fingerprint: (ctx.utlsFingerprint as UtlsFingerprint | undefined) ?? 'randomized',
    override: ctx.utlsFingerprint ? 'always' : 'when-missing-or-chrome',
  })
  profile.proxies = rotatedProxies

  const proxyNames = profile.proxies.map((p) => p.name)

  const managedGroups: ParsedProxyGroup[] = [
    {
      name: SLAVE_SELECT_GROUP,
      type: 'select',
      proxies: [SLAVE_AUTO_GROUP, ...proxyNames],
    },
    {
      name: SLAVE_AUTO_GROUP,
      type: 'url-test',
      proxies: proxyNames.length > 0 ? proxyNames : ['DIRECT'],
      url: URL_TEST_URL,
      interval: URL_TEST_INTERVAL,
    },
  ]

  const rules = ctx.androidRouting
    ? buildAndroidRules(ctx.androidRouting)
    : ctx.routingPolicy
    ? ruleCompiler.compile(ctx.routingPolicy, { proxyGroupName: SLAVE_SELECT_GROUP }).rules
    : buildLegacyRules(ctx.vpnMode, ctx.settings.splitTunnelProcesses)

  const config: Record<string, unknown> = {
    'mixed-port': ctx.settings.mixedPort,
    'allow-lan': false,
    mode: ctx.androidRouting ? androidClashMode(ctx.androidRouting.mode) : 'rule',
    'log-level': 'info',
    'unified-delay': true,
    'tcp-concurrent': true,
    'external-controller': `127.0.0.1:${ctx.apiPort}`,
    secret: ctx.apiSecret,
    // Geo databases: Android auto-downloads from MetaCubeX (no rulesDir, files
    // too big to ship); desktop uses the packaged file:// databases.
    ...(ctx.androidRouting?.geoEnabled ? {
      'geodata-mode': true,
      'geo-auto-update': true,
      'geo-update-interval': 24,
      'geox-url': META_GEOX_URL,
    } : ctx.rulesDir ? {
      'geodata-mode': true,
      'geo-auto-update': false,
      'geox-url': {
        geoip:   pathToFileUrl(ctx.rulesDir, 'geoip.dat'),
        geosite: pathToFileUrl(ctx.rulesDir, 'geosite.dat'),
        mmdb:    pathToFileUrl(ctx.rulesDir, 'geoip.dat'),  // fallback
      },
    } : {}),
    proxies: profile.proxies as unknown[],
    'proxy-groups': [
      ...managedGroups,
      // Filter out groups with no proxies — mihomo rejects empty select/url-test groups
      ...profile.proxyGroups.filter(g => g.proxies.length > 0),
    ] as unknown[],
    ...(ctx.androidRouting && ctx.androidRouting.bypassProviders.length > 0
      ? { 'rule-providers': buildBypassRuleProviders(ctx.androidRouting.bypassProviders) }
      : {}),
    rules,
  }

  if (ctx.settings.tunEnabled) {
    config['tun'] = buildTunSection(ctx.settings)
    config['sniffer'] = buildSnifferSection()
  }

  config['dns'] = ctx.androidRouting
    ? buildAndroidDnsSection(ctx.settings, ctx.androidRouting)
    : ctx.dnsProfile
    ? dnsCompiler.compile(ctx.dnsProfile).config
    : buildLegacyDnsSection(ctx.settings)

  config['profile'] = { 'store-selected': true, 'store-fake-ip': false }

  return yaml.dump(config, { lineWidth: -1, noRefs: true })
}

function buildTunSection(settings: GeneratorSettings): Record<string, unknown> {
  return {
    enable: true,
    stack: settings.tunStack,
    device: 'Mihomo',
    mtu: 9000,
    'dns-hijack': ['any:53'],
    'auto-route': true,
    'strict-route': true,
    'auto-detect-interface': true,
  }
}

function buildSnifferSection(): Record<string, unknown> {
  return {
    enable: true,
    sniff: {
      TLS: { ports: [443, 8443] },
      HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
      QUIC: { ports: [443, 8443] },
    },
    'skip-domain': [
      '+.push.apple.com',
      '+.apple.com',
      'Mijia Cloud',
    ],
  }
}

// Domains that MUST get real IPs (fake-ip breaks them)
const FAKE_IP_FILTER = [
  '*.lan',
  '*.local',
  '*.localhost',
  'localhost.ptlogin2.qq.com',
  '*.msftconnecttest.com',
  '*.msftncsi.com',
  'time.*.com',
  'time.*.gov',
  'ntp.*.com',
  '*.ntp.org.cn',
  'time.cloudflare.com',
  '*.apple.com',
  'gateway.icloud.com',
  '*.srv.nintendo.net',
  '*.stun.*.*',
  'stun.*.*',
]

function buildLegacyDnsSection(settings: GeneratorSettings): Record<string, unknown> {
  return {
    enable: true,
    // Port 53 is occupied by Windows DNS Client on many systems; use a
    // non-conflicting port. TUN dns-hijack intercepts at packet level
    // and does not depend on this listen address.
    listen: '0.0.0.0:1053',
    ipv6: false,
    'use-system-hosts': false,
    'enhanced-mode': settings.fakeIpEnabled ? 'fake-ip' : 'normal',
    ...(settings.fakeIpEnabled ? {
      'fake-ip-range': '198.18.0.1/16',
      'fake-ip-filter': FAKE_IP_FILTER,
    } : {}),
    nameserver: [
      settings.dnsOverHttps,
      'https://1.1.1.1/dns-query',
    ],
    fallback: ['8.8.8.8', '1.1.1.1', ...settings.fallbackDns],
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
    },
  }
}

// Private IP ranges — always direct regardless of mode to prevent routing loops.
// GEOIP,private is Mihomo built-in and does NOT require geoip.dat.
const PRIVATE_DIRECT_RULES = [
  'GEOIP,private,DIRECT,no-resolve',
  'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
  'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
  'IP-CIDR,169.254.0.0/16,DIRECT,no-resolve',
  'IP-CIDR,224.0.0.0/4,DIRECT,no-resolve',
  'IP-CIDR,240.0.0.0/4,DIRECT,no-resolve',
]

function buildLegacyRules(mode: VPNMode, splitProcesses?: string[]): string[] {
  switch (mode) {
    case 'full':
      return [
        ...PRIVATE_DIRECT_RULES,
        `MATCH,${SLAVE_SELECT_GROUP}`,
      ]

    case 'bypass':
      // All non-private traffic through VPN.
      // Geo-based bypass (RU, CN) requires geoip.dat/geosite.dat which must be
      // packaged separately — added when geo data is available.
      return [
        ...PRIVATE_DIRECT_RULES,
        `MATCH,${SLAVE_SELECT_GROUP}`,
      ]

    case 'split':
      return [
        ...(splitProcesses ?? []).map((p) => `PROCESS-NAME,${p},${SLAVE_SELECT_GROUP}`),
        ...PRIVATE_DIRECT_RULES,
        'MATCH,DIRECT',
      ]

    case 'custom':
      return [
        ...PRIVATE_DIRECT_RULES,
        `MATCH,${SLAVE_SELECT_GROUP}`,
      ]
  }
}

// ─── Android smart routing (RU split tunnelling) — verified by real curls ────

// Auto-downloaded geo databases (MetaCubeX/meta-rules-dat) for the GEOIP/GEOSITE
// RU rules. mihomo fetches these on first start (needs internet once).
const META_GEOX_URL = {
  geoip:   'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat',
  geosite: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat',
  mmdb:    'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country.mmdb',
}

function androidClashMode(mode: AndroidRoutingMode): 'rule' | 'global' | 'direct' {
  if (mode === 'global') return 'global'
  if (mode === 'direct') return 'direct'
  return 'rule'
}

// Ordered rules (verified: instagram→proxy, yandex→direct, node→direct, *→proxy):
//   1. node domains → DIRECT (anti-loop)
//   2. RKN-blocked rule-providers → SLAVE-SELECT (через VPN)  [BEFORE GEOSITE:RU]
//   3. private/local → DIRECT
//   4. GEOSITE,category-ru → DIRECT  +  GEOIP,ru → DIRECT     (РФ напрямую, скорость)
//   5. MATCH → SLAVE-SELECT
function buildAndroidRules(opts: AndroidRoutingOptions): string[] {
  if (opts.mode === 'direct') return ['MATCH,DIRECT']
  if (opts.mode === 'global') return [...PRIVATE_DIRECT_RULES, `MATCH,${SLAVE_SELECT_GROUP}`]

  const rules: string[] = []
  for (const s of opts.nodeDomainSuffixes) rules.push(`DOMAIN-SUFFIX,${s},DIRECT`)
  for (const p of opts.bypassProviders) {
    rules.push(p.behavior === 'ipcidr'
      ? `RULE-SET,${p.name},${SLAVE_SELECT_GROUP},no-resolve`
      : `RULE-SET,${p.name},${SLAVE_SELECT_GROUP}`)
  }
  rules.push(...PRIVATE_DIRECT_RULES)
  if (opts.geoEnabled) {
    rules.push('GEOSITE,category-ru,DIRECT')
    rules.push('GEOIP,ru,DIRECT')
  }
  rules.push(`MATCH,${SLAVE_SELECT_GROUP}`)
  return rules
}

function buildBypassRuleProviders(providers: AndroidBypassProvider[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const p of providers) {
    out[p.name] = {
      type: 'http',
      behavior: p.behavior,
      url: p.url,
      path: p.path,
      interval: 86400, // auto-refresh daily
      format: 'text',
    }
  }
  return out
}

// Hardened DNS (issue #9): DoH for clean domains, RU domains via fast RU DNS
// (direct), proxy-server-nameserver resolves the node domains, respect-rules
// keeps user-domain DNS inside the tunnel. default-nameserver is the only
// plaintext and ONLY bootstraps the DoH host / direct lookups. (verified)
function buildAndroidDnsSection(settings: GeneratorSettings, opts: AndroidRoutingOptions): Record<string, unknown> {
  const doh = settings.dnsOverHttps || 'https://cloudflare-dns.com/dns-query'
  return {
    enable: true,
    listen: '0.0.0.0:1053',
    ipv6: false,
    'use-system-hosts': false,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'fake-ip-filter': [
      '*.lan', '*.local', '*.localdomain', '*.localhost', 'localhost',
      'time.*.com', 'ntp.*.com', '*.msftncsi.com', '*.msftconnecttest.com',
      'connectivitycheck.gstatic.com', 'captive.apple.com',
      // never fake-ip the node domains — they must resolve to real IPs
      ...opts.nodeDomainSuffixes.map(s => `+.${s}`),
    ],
    'default-nameserver': ['223.5.5.5', '8.8.8.8'],
    nameserver: [doh],
    'proxy-server-nameserver': [doh],
    'nameserver-policy': {
      // RU domains → Yandex DNS, resolved directly (fast, no leak for RU)
      'geosite:category-ru': '77.88.8.8',
      'geosite:private': 'system',
    },
    'respect-rules': true,
  }
}

// Convert OS path to a file:// URL accepted by mihomo's geox-url.
// On Windows: "E:\path\to\file.dat" → "file:///E:/path/to/file.dat".
// On POSIX:  "/path/to/file.dat"   → "file:///path/to/file.dat".
function pathToFileUrl(dir: string, filename: string): string {
  const normalized = `${dir}/${filename}`.replace(/\\/g, '/')
  return normalized.startsWith('/')
    ? `file://${normalized}`
    : `file:///${normalized}`
}

export function getAutoSelectGroupName(): string {
  return SLAVE_AUTO_GROUP
}

export function getSelectGroupName(): string {
  return SLAVE_SELECT_GROUP
}

export function getProxyNamesFromYaml(subscriptionYaml: string): string[] {
  try {
    const parser = new SubscriptionParser()
    const profile = parser.parse(subscriptionYaml)
    return profile.proxies.map((p: ParsedProxy) => p.name)
  } catch {
    return []
  }
}

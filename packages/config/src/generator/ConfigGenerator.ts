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
  /** auto-refresh interval in seconds (default 86400 = daily) */
  intervalSeconds?: number
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
  // Lower-cased geosite category names present in the installed geosite.dat.
  // When provided (Windows engine reads them from the synced geosite.dat), the
  // generator DROPS any `GEOSITE,<cat>,...` rule whose category is absent — a
  // missing category otherwise makes mihomo fatal at parse. When unset/empty,
  // no geosite filtering is applied (Android auto-downloads a known dat).
  availableGeoSites?: readonly string[]
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
// Autobalancer (SLAVE-AUTO) tuning: only re-pick a faster node when it beats the
// current one by >50ms (tolerance) to avoid flapping between near-equal servers;
// lazy=true skips health checks while the group isn't actively carrying traffic.
const URL_TEST_TOLERANCE = 50
const URL_TEST_LAZY = true

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
      tolerance: URL_TEST_TOLERANCE,
      lazy: URL_TEST_LAZY,
    },
  ]

  // Rules precedence: a composed routingPolicy (scenarios) WINS over the legacy
  // androidRouting hardcoded rules even when both are present — this lets Android
  // run the shared scenario routing while androidRouting still drives the
  // Android-specific geo auto-download, DNS section and node-domain anti-loop
  // below (P1.b). Pure capability add: the existing Windows-only (routingPolicy)
  // and Android-only (androidRouting) callers are unaffected.
  const rawRules = ctx.routingPolicy
    ? mergeAndroidExtras(
        ruleCompiler.compile(ctx.routingPolicy, { proxyGroupName: SLAVE_SELECT_GROUP }).rules,
        ctx.androidRouting,
      )
    : ctx.androidRouting
    ? buildAndroidRules(ctx.androidRouting)
    : buildLegacyRules(ctx.vpnMode, ctx.settings.splitTunnelProcesses)

  // Drop GEOSITE rules whose category isn't in the installed geosite.dat —
  // mihomo fatals at parse on an unknown category (e.g. RuNet-specific
  // `ru-blocked`/`antifilter-community` that live in a separate .dat, or
  // `torrent`/`twitch-ads` absent from the MetaCubeX build). Only filter when we
  // actually know the available set; otherwise leave rules untouched.
  const rules = filterUnknownGeoSiteRules(rawRules, ctx.availableGeoSites)

  const config: Record<string, unknown> = {
    'mixed-port': ctx.settings.mixedPort,
    'allow-lan': false,
    // A routingPolicy implies rule-based routing; otherwise honor the Android
    // smart/global/direct mode, else default to 'rule'.
    mode: ctx.routingPolicy ? 'rule' : ctx.androidRouting ? androidClashMode(ctx.androidRouting.mode) : 'rule',
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
      // Desktop: the engine physically copies geoip.dat/geosite.dat from the
      // rules dir into mihomo's working dir (`-d`), where mihomo loads them
      // locally. We do NOT point geox-url at a file:// URL — mihomo's geo
      // downloader only speaks http/https and fatals on `file://`. The http
      // META_GEOX_URL stays only as a last-resort fallback (used solely if the
      // local copy is somehow missing); geo-auto-update stays off.
      'geodata-mode': true,
      'geo-auto-update': false,
      'geox-url': META_GEOX_URL,
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
  }
  // Sniffer recovers the real SNI/Host for connections that hit a raw IP (apps
  // that bypass the tunnel DNS / hardcode IPs), so domain rules (GEOSITE
  // category-ru, the RKN bypass lists) still apply. Needed on Android too, where
  // the native side injects the TUN fd so `tunEnabled` is false but mihomo still
  // owns the tunnel.
  if (ctx.settings.tunEnabled || ctx.androidRouting) {
    config['sniffer'] = buildSnifferSection()
  }

  // DNS: a dnsProfile (Windows presets OR the unified Android profile from
  // buildAndroidDnsProfile) is compiled through the shared MihomoDnsCompiler.
  // Android now always supplies one (P2 — replaces the old inline
  // buildAndroidDnsSection, verified byte-identical), so both platforms share one
  // DNS path. buildLegacyDnsSection remains only for callers that pass neither.
  config['dns'] = ctx.dnsProfile
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
/**
 * Merge the Android-specific extras into a composed scenario policy's rules.
 *
 * When Android runs the unified `routingPolicy` (P1) the scenario rules drive
 * routing, but the `androidRouting` block still carries two things the scenario
 * model doesn't express and that MUST survive — otherwise they're silently lost
 * (the P1.b regression: rule-providers were declared but no rule referenced
 * them, so RKN-blocked sites fell through to the catch-all and dialed DIRECT):
 *
 *   1. node-domain → DIRECT (anti-loop). Prepended FIRST so the proxy node's own
 *      hostname is never itself routed through the proxy — critical under a
 *      proxy-default scenario (roscomvpn-default / smart-global), harmless under
 *      a direct-default one.
 *   2. RKN bypass RULE-SET → SLAVE-SELECT. Placed right after the node rules
 *      (high priority, mirrors the old buildAndroidRules order) so user-managed
 *      blocked-list domains tunnel even when the active scenario's default is
 *      DIRECT.
 *
 * No-op when there's no androidRouting (pure Windows path) or it carries no
 * extras, so the composed rules pass through unchanged.
 */
function mergeAndroidExtras(policyRules: readonly string[], opts?: AndroidRoutingOptions): string[] {
  if (!opts) return [...policyRules]
  const nodeDirect = opts.nodeDomainSuffixes.map((s) => `DOMAIN-SUFFIX,${s},DIRECT`)
  const bypass = opts.bypassProviders.map((p) =>
    p.behavior === 'ipcidr'
      ? `RULE-SET,${p.name},${SLAVE_SELECT_GROUP},no-resolve`
      : `RULE-SET,${p.name},${SLAVE_SELECT_GROUP}`,
  )
  if (nodeDirect.length === 0 && bypass.length === 0) return [...policyRules]
  return [...nodeDirect, ...bypass, ...policyRules]
}

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
      interval: p.intervalSeconds && p.intervalSeconds > 0 ? p.intervalSeconds : 86400,
      format: 'text',
    }
  }
  return out
}

// The hardened Android DNS section now lives in the shared dns package
// (buildAndroidDnsProfile → MihomoDnsCompiler), so both platforms compile DNS
// through one path. See packages/dns/src/profiles/AndroidDnsProfile.ts.

// Remove `GEOSITE,<cat>,...` rules whose category is not in the installed
// geosite.dat. mihomo aborts the whole config if any geosite rule names an
// unknown category, so silently dropping the unmatched ones keeps the rest of
// the (valid) split-routing policy alive. No-op when the available set is
// unknown/empty — we never strip rules we can't verify.
function filterUnknownGeoSiteRules(rules: readonly string[], available?: readonly string[]): string[] {
  if (!available || available.length === 0) return [...rules]
  const known = new Set(available.map((c) => c.toLowerCase()))
  return rules.filter((rule) => {
    const m = /^GEOSITE,([^,]+),/i.exec(rule)
    if (!m) return true
    return known.has(m[1]!.toLowerCase())
  })
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

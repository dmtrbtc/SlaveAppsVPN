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
// Load-balance group used ONLY for Telegram (see rebalanceTelegramRules). Telegram
// media downloads open many parallel connections to the DCs; pinned to the single
// user-selected node (SLAVE-SELECT) they all share one uplink → «то быстро, то
// медленно» as that node congests. A round-robin load-balance spreads each new
// connection across all nodes, so the parallel media streams use aggregate
// bandwidth. round-robin is per-CONNECTION, so a single voice call (one connection)
// still stays on one node for its duration — no mid-call jitter.
const SLAVE_BALANCE_GROUP = 'SLAVE-BALANCE'
// HTTPS (not http) — mihomo warns that HTTP health-check URLs can be hijacked by
// proxies and that some don't handle the repeated HEAD requests, causing false
// «context deadline exceeded» health-check failures. HTTPS is the recommended,
// more reliable probe target.
const URL_TEST_URL = 'https://www.gstatic.com/generate_204'
// 60s (was 120s → 300s): after the app is backgrounded and the device dozes, the
// proxy TCP connections die; on resume the url-test group keeps the stale «best»
// node until the next health-check, so the first request (e.g. Telegram) stalls on
// a dead node. A shorter interval re-picks a live node sooner → faster reconnect
// after idle (the reported «долгие реконнекты в Телеграм»). lazy=true keeps probing
// only while the group is actively carrying traffic, so idle battery cost stays low.
const URL_TEST_INTERVAL = 60
// Autobalancer (SLAVE-AUTO) tuning: only re-pick a faster node when it beats the
// current one by >50ms (tolerance) to avoid flapping between near-equal servers;
// lazy=true skips health checks while the group isn't actively carrying traffic.
const URL_TEST_TOLERANCE = 50
const URL_TEST_LAZY = true
// SLAVE-BALANCE health-check is tighter than the url-test groups: a load-balance
// round-robins to EVERY member, so a dead node (a down cabinet server, or a flaky
// third-party node merged in from a second subscription) keeps eating Telegram
// connections until health-check marks it down. A 30s interval + a short 3s
// timeout drops dead members quickly so balancing stays among live nodes.
const BALANCE_HEALTH_INTERVAL = 30
const BALANCE_HEALTH_TIMEOUT = 3000

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

  // Balancing Telegram only makes sense with ≥2 nodes; with one node there's
  // nothing to spread across, so keep Telegram on SLAVE-SELECT (respects the
  // manual pick) and don't emit an empty/pointless balance group.
  const useTelegramBalance = proxyNames.length >= 2

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
    ...(useTelegramBalance ? [{
      name: SLAVE_BALANCE_GROUP,
      type: 'load-balance',
      proxies: proxyNames,
      // round-robin spreads each new connection across nodes (throughput for
      // Telegram's parallel media streams). A tight health-check (30s + 3s
      // timeout) drops dead members fast so balancing stays among LIVE nodes —
      // without it a down cabinet node or a flaky third-party node (merged from a
      // second subscription) keeps timing out Telegram connections.
      strategy: 'round-robin',
      url: URL_TEST_URL,
      interval: BALANCE_HEALTH_INTERVAL,
      timeout: BALANCE_HEALTH_TIMEOUT,
      lazy: URL_TEST_LAZY,
    } as ParsedProxyGroup] : []),
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
  const filteredRules = filterUnknownGeoSiteRules(rawRules, ctx.availableGeoSites)
  // Redirect Telegram (GEOSITE/GEOIP,telegram) from the single-node SLAVE-SELECT
  // to the round-robin SLAVE-BALANCE group so parallel media connections spread
  // across nodes. No-op when there are <2 nodes (group not emitted).
  const rules = useTelegramBalance
    ? rebalanceTelegramRules(filteredRules, SLAVE_SELECT_GROUP, SLAVE_BALANCE_GROUP)
    : filteredRules

  const config: Record<string, unknown> = {
    'mixed-port': ctx.settings.mixedPort,
    'allow-lan': false,
    // Global IPv6 OFF. The device/uplink has no working IPv6 route, yet apps with
    // their own DoH resolve AAAA and dial v6 into the tunnel (the TUN advertises
    // ::/0). mihomo would then attempt the v6 destination and only fail with
    // «network is unreachable» before the app's happy-eyeballs falls back to IPv4
    // — a wasted connect leg on every dual-stack host (slowdown + log spam). With
    // ipv6:false mihomo rejects v6 destinations immediately, so IPv4 is used
    // without the stall. (dns.ipv6 is already false; this is the global switch.)
    ipv6: false,
    // A routingPolicy implies rule-based routing; otherwise honor the Android
    // smart/global/direct mode, else default to 'rule'.
    mode: ctx.routingPolicy ? 'rule' : ctx.androidRouting ? androidClashMode(ctx.androidRouting.mode) : 'rule',
    'log-level': 'info',
    'unified-delay': true,
    'tcp-concurrent': true,
    // TCP keep-alive on mihomo's connections (seconds). Without it, sockets that
    // die silently while the device is in Doze (app backgrounded) linger until a
    // long OS/app timeout, so the first request after resume hangs. A 15s probe
    // (was 30s) detects and recycles dead connections faster → snappier reconnect,
    // the main fix for «Telegram doesn't reconnect immediately after minimize/restore».
    'keep-alive-interval': 15,
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

// Redirect the Telegram routing rules (GEOSITE,telegram / GEOIP,telegram) from
// `fromGroup` (SLAVE-SELECT, single node) to `toGroup` (SLAVE-BALANCE, round-robin).
// Only these two rules are touched — every other rule keeps its original target, so
// the user's manual node pick still governs general surfing. Comma-split (not regex)
// so a trailing `,no-resolve` on the GEOIP rule is preserved.
function rebalanceTelegramRules(rules: string[], fromGroup: string, toGroup: string): string[] {
  return rules.map((rule) => {
    const parts = rule.split(',')
    const isTelegram = (parts[0] === 'GEOSITE' || parts[0] === 'GEOIP') && parts[1] === 'telegram'
    if (isTelegram && parts[2] === fromGroup) {
      parts[2] = toGroup
      return parts.join(',')
    }
    return rule
  })
}

// Telegram data-center ranges (official https://core.telegram.org/resources/cidr.txt).
// MTProto to these DCs is Telegram's own obfuscated protocol on :443, NOT real TLS —
// the sniffer can never recover an SNI, so it retries and stalls («All sniffing sniff
// failed» / «Skip sniffing … due to multiple failures») on every connection before
// giving up. Telegram media opens many parallel connections, so that per-connection
// sniff-wait compounds into visibly slow media loading. These IPs are already routed
// correctly by GeoIP(telegram); sniffing them buys nothing, so skip it outright.
const TELEGRAM_SNIFF_SKIP_CIDRS = [
  '91.105.192.0/23',
  '91.108.4.0/22',
  '91.108.8.0/22',
  '91.108.12.0/22',
  '91.108.16.0/22',
  '91.108.20.0/22',
  '91.108.56.0/22',
  '95.161.64.0/20',
  '149.154.160.0/20',
  '2001:67c:4e8::/48',
  '2001:b28:f23c::/48',
  '2001:b28:f23d::/48',
  '2001:b28:f23f::/48',
  '2001:b28:f242::/48',
]

function buildSnifferSection(): Record<string, unknown> {
  return {
    enable: true,
    sniff: {
      TLS: { ports: [443, 8443] },
      // HTTP sniff only on :80. The old [80, '8080-8880'] range caught masses of
      // non-HTTP / server-speaks-first traffic (ad/analytics SDKs hammer :8080),
      // where the sniffer waits for client data that never comes → «may not have
      // any sent data» ERROR spam + a per-connection sniff-wait stall before the
      // connection proceeds. TLS/QUIC sniff (443/8443) still recovers SNI for all
      // HTTPS, so domain rules keep working; plain-HTTP only really lives on :80.
      HTTP: { ports: [80], 'override-destination': true },
      QUIC: { ports: [443, 8443] },
    },
    'skip-domain': [
      '+.push.apple.com',
      '+.apple.com',
      'Mijia Cloud',
    ],
    // Don't even attempt to sniff Telegram DC connections (see const above).
    'skip-dst-address': TELEGRAM_SNIFF_SKIP_CIDRS,
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

    case 'blocked':
      // «Только заблокированное» normally runs via the smart-russia-bypass scenario
      // policy; this is the legacy fallback (if that policy fails validation):
      // everything DIRECT, while the RKN-list rule-providers (added separately,
      // action=proxy) still send blocked domains through the VPN.
      return [
        ...PRIVATE_DIRECT_RULES,
        'MATCH,DIRECT',
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
  // NEVER use clash `mode: global` — it IGNORES the rule list and forces every
  // connection (DNS, the local external-controller API, even the proxy's own
  // outbound) through the GLOBAL group, which our config doesn't define → foreign
  // sites die, the engine API becomes unreachable and logs stop. The 'global'
  // routing intent is expressed as RULES instead (buildAndroidRules → MATCH,
  // SLAVE-SELECT with private-direct), so rule mode does the full tunnel safely.
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
  if (opts.mode === 'global') return [
    // Anti-loop: the proxy node's own domain must dial DIRECT, else MATCH would
    // route the node connection through the node itself.
    ...opts.nodeDomainSuffixes.map((s) => `DOMAIN-SUFFIX,${s},DIRECT`),
    ...PRIVATE_DIRECT_RULES,
    `MATCH,${SLAVE_SELECT_GROUP}`,
  ]

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

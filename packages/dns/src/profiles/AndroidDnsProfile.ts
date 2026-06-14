import type { DnsProfile, DnsResolver, DnsRule } from './DnsProfile'

/**
 * The hardened Android DNS profile, expressed in the shared DnsProfile model so
 * BOTH platforms compile their DNS through one MihomoDnsCompiler (issue #9 + the
 * R0.2 РФ-direct fix). Produces a config functionally equivalent to the former
 * inline `buildAndroidDnsSection`:
 *
 *   - enhanced-mode fake-ip, with `+.ru`/`+.рф`/`geosite:category-ru` and every
 *     proxy NODE domain excluded so they resolve to REAL IPs (GEOIP,RU,DIRECT can
 *     then catch the .ru long-tail; node domains avoid the fake-ip loop).
 *   - DoH-only `nameserver` pool (the chosen provider + Google), carried through
 *     the tunnel (respect-rules); `proxy-server-nameserver` = the same DoH pool.
 *   - plaintext `default-nameserver` bootstrap (AliDNS + Yandex) for the DoH
 *     hostnames + direct lookups; `prefer-h3: false` to keep DoH on TCP/443.
 *   - nameserver-policy: RU TLDs/geosite → Yandex+Google direct; geosite:private
 *     → system; each node domain → system+Google so it resolves before the tunnel.
 */

// RU domains resolve via TWO Russian plaintext resolvers (both Yandex) so they
// get RU-localised CDN IPs and stay DIRECT. Both are RU IPs → GeoIP(ru)→DIRECT,
// so neither is routed through the proxy. (The old list mixed in Google 8.8.8.8,
// a NON-RU IP that respect-rules sent through the tunnel → a parallel DNS dial
// that the Yandex winner cancelled — "operation was canceled" log spam + leak.)
const RU_DIRECT_RESOLVERS = ['77.88.8.8', '77.88.8.1'] as const

// Local/captive-portal entries that must never get a fake-ip. The RU entries
// (+.ru/+.рф/category-ru) are appended only when ruDirectDns is on (bypass/custom)
// — in full/split EVERYTHING (incl. RU) tunnels, so RU domains should fake-ip and
// resolve via DoH like the rest (no plaintext RU leak).
const ANDROID_FAKE_IP_FILTER_BASE = [
  '*.lan', '*.local', '*.localdomain', '*.localhost', 'localhost',
  'time.*.com', 'ntp.*.com', '*.msftncsi.com', '*.msftconnecttest.com',
  'connectivitycheck.gstatic.com', 'captive.apple.com',
] as const

const ANDROID_FAKE_IP_FILTER_RU = ['+.ru', '+.рф', 'geosite:category-ru'] as const

export interface AndroidDnsProfileOptions {
  /** Chosen DoH endpoint (from the user's provider selector). */
  dohUrl: string
  /** Proxy node domains — excluded from fake-ip and resolved directly. */
  nodeDomainSuffixes: readonly string[]
  /**
   * Resolve RU domains via a Russian resolver and keep them on real IPs so they
   * route DIRECT. On for «Обход»/«Свой»; OFF for «Полный»/«Раздельный», where RU
   * also tunnels and must resolve via DoH (no plaintext RU DNS leak). Default on.
   */
  ruDirectDns?: boolean
}

export function buildAndroidDnsProfile(opts: AndroidDnsProfileOptions): DnsProfile {
  const primaryDoh = opts.dohUrl || 'https://dns.cloudflare.com/dns-query'
  // DoH pool: primary + Google, deduped. preferH3:false → no `#h3=true` suffix.
  const dohUrls = Array.from(new Set([primaryDoh, 'https://dns.google/dns-query']))
  const dohPool: DnsResolver[] = dohUrls.map((url) => ({ url, type: 'doh', preferH3: false }))

  const bootstrap: DnsResolver[] = [
    { url: '223.5.5.5', type: 'udp' },
    { url: '77.88.8.8', type: 'udp' },
  ]

  const ruDirectDns = opts.ruDirectDns ?? true

  const ruRules: DnsRule[] = ruDirectDns
    ? [
        { id: 'ru-tld', matchType: 'domain_suffix', value: 'ru', resolverTag: [...RU_DIRECT_RESOLVERS] },
        { id: 'rf-tld', matchType: 'domain_suffix', value: 'рф', resolverTag: [...RU_DIRECT_RESOLVERS] },
        { id: 'ru-geosite', matchType: 'geosite', value: 'category-ru', resolverTag: [...RU_DIRECT_RESOLVERS] },
      ]
    : []

  // Proxy node domains resolve via the DoH pool, NOT `system`. Under the Android
  // VpnService TUN the `system` resolver loops its query back through the tun
  // (hijacked to fake-ip) and ALWAYS fails — «resolve … from system() … all DNS
  // requests failed» — before mihomo retries on the DoH pool. Pointing node
  // domains straight at DoH removes the failed first attempt (log spam + a
  // first-connect stall) and keeps resolution encrypted/poison-resistant. mihomo
  // bootstraps the DoH host IPs via default-nameserver (plaintext), then queries
  // DoH directly (not through the not-yet-up tunnel), exactly as the fallback did.
  const nodeResolverTags = dohUrls

  const rules: DnsRule[] = [
    ...ruRules,
    { id: 'private-geosite', matchType: 'geosite', value: 'private', resolverTag: 'system' },
    ...opts.nodeDomainSuffixes.map((s, i) => ({
      id: `node-${i}`,
      matchType: 'domain_suffix' as const,
      value: s,
      resolverTag: nodeResolverTags,
    })),
  ]

  return {
    mode: 'fake-ip',
    nameservers: dohPool,
    // No fallback pool — the DoH pool through the tunnel is authoritative.
    bootstrapNameservers: bootstrap,
    defaultNameservers: bootstrap,
    proxyServerNameservers: dohPool,
    preferH3: false,
    fakeIp: {
      enabled: true,
      range: '198.18.0.1/16',
      filter: [
        ...ANDROID_FAKE_IP_FILTER_BASE,
        ...(ruDirectDns ? ANDROID_FAKE_IP_FILTER_RU : []),
        ...opts.nodeDomainSuffixes.map((s) => `+.${s}`),
      ],
    },
    // respect-rules on (useSystemDns:false) but no fallback-filter (no fallback pool).
    leakPrevention: { enabled: false, useSystemDns: false },
    ipv6: { enabled: false },
    // The sniffer section is emitted separately by the generator; keep this off so
    // the compiler doesn't add a `use-hosts` key the inline builder never had.
    sniffing: { enabled: false, overrideDestination: false, protocols: [] },
    strategy: 'prefer_ipv4',
    rules,
  }
}

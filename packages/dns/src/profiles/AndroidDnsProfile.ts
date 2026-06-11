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

const RU_DIRECT_RESOLVERS = ['77.88.8.8', '8.8.8.8'] as const
const NODE_DIRECT_RESOLVERS = ['system', '8.8.8.8'] as const

// Mirrors the former buildAndroidDnsSection fake-ip-filter base (RU + node
// suffixes are appended below). Distinct from the desktop DEFAULT_FAKE_IP_FILTER
// — the mobile list is intentionally lean.
const ANDROID_FAKE_IP_FILTER_BASE = [
  '*.lan', '*.local', '*.localdomain', '*.localhost', 'localhost',
  'time.*.com', 'ntp.*.com', '*.msftncsi.com', '*.msftconnecttest.com',
  'connectivitycheck.gstatic.com', 'captive.apple.com',
  '+.ru', '+.рф', 'geosite:category-ru',
] as const

export interface AndroidDnsProfileOptions {
  /** Chosen DoH endpoint (from the user's provider selector). */
  dohUrl: string
  /** Proxy node domains — excluded from fake-ip and resolved directly. */
  nodeDomainSuffixes: readonly string[]
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

  const rules: DnsRule[] = [
    { id: 'ru-tld', matchType: 'domain_suffix', value: 'ru', resolverTag: [...RU_DIRECT_RESOLVERS] },
    { id: 'rf-tld', matchType: 'domain_suffix', value: 'рф', resolverTag: [...RU_DIRECT_RESOLVERS] },
    { id: 'ru-geosite', matchType: 'geosite', value: 'category-ru', resolverTag: [...RU_DIRECT_RESOLVERS] },
    { id: 'private-geosite', matchType: 'geosite', value: 'private', resolverTag: 'system' },
    ...opts.nodeDomainSuffixes.map((s, i) => ({
      id: `node-${i}`,
      matchType: 'domain_suffix' as const,
      value: s,
      resolverTag: [...NODE_DIRECT_RESOLVERS],
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
      filter: [...ANDROID_FAKE_IP_FILTER_BASE, ...opts.nodeDomainSuffixes.map((s) => `+.${s}`)],
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

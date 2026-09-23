// Shared DoH (DNS-over-HTTPS) provider catalogue — the SINGLE source for the
// cross-platform "DNS provider" selector. The chosen provider's endpoint becomes
// the primary DoH nameserver on BOTH platforms: Windows overrides the preset's
// primaryDoh with it (resolveDnsProfile), Android feeds it to buildAndroidDnsProfile.
// Previously this lived only in the Android renderer (runtime-settings.ts), so
// Windows had no provider choice — now it's unified here.

export interface DohProvider {
  id: string
  label: string
  /** DoH endpoint. Empty for the "custom" entry until the user fills `customUrl`. */
  doh: string
}

// Endpoints are IP-LITERAL DoH URLs (https://1.1.1.1/… not https://dns.cloudflare.com/…)
// on purpose: a hostname endpoint must first be bootstrapped via plaintext UDP:53,
// which hostile RU ISPs (Rostelekom) hijack/poison and where the old China AliDNS
// bootstrap was often unreachable → the DoH server hostname never resolved → DNS
// died entirely. Cloudflare/Google/Quad9 all serve DoH on their anycast IP with a
// cert carrying that IP in the SAN, so TLS validates WITHOUT any prior resolution —
// the ISP can neither redirect nor poison it. This also hardens proxy-server-nameserver
// (the proxy node's own hostname now resolves over un-poisonable IP-DoH).
//
// NOTE: AdGuard (dns.adguard-dns.com / 94.140.x) stays OUT of the defaults — its
// servers are RKN-throttled when queried directly from Russia, so picking it killed
// all DNS for RU users. Power users can still point «Свой DoH» at it. resolveDohUrl()
// falls back to Cloudflare for an unknown id, so installs that persisted
// {id:'adguard'} self-heal.
export const DOH_PROVIDERS: DohProvider[] = [
  { id: 'cloudflare',     label: 'Cloudflare',          doh: 'https://1.1.1.1/dns-query' },
  { id: 'google',         label: 'Google',              doh: 'https://8.8.8.8/dns-query' },
  { id: 'quad9',          label: 'Quad9',               doh: 'https://9.9.9.9/dns-query' },
  // Reserves on different anycast IPs — switch here if the primary is throttled on a
  // given ISP (same operator, alternate IP that may route better past the block).
  { id: 'cloudflare-alt', label: 'Cloudflare (резерв)', doh: 'https://1.0.0.1/dns-query' },
  { id: 'quad9-alt',      label: 'Quad9 (резерв)',      doh: 'https://149.112.112.112/dns-query' },
]

export interface DohProviderSetting {
  /** preset id from DOH_PROVIDERS, or 'custom' */
  id: string
  /** used when id === 'custom'. `| undefined` so it accepts zod-parsed input
   *  (z.string().optional()) under exactOptionalPropertyTypes. */
  customUrl?: string | undefined
}

export const DEFAULT_DOH_PROVIDER: DohProviderSetting = { id: 'cloudflare' }

/**
 * Resolve the effective DoH URL for a provider setting. Returns the Cloudflare
 * default for an unknown id or an invalid custom URL, so callers always get a
 * usable https:// endpoint.
 */
export function resolveDohUrl(v: DohProviderSetting = DEFAULT_DOH_PROVIDER): string {
  if (v.id === 'custom') {
    const u = (v.customUrl ?? '').trim()
    if (/^https:\/\//i.test(u)) return u
    return DOH_PROVIDERS[0]!.doh
  }
  return DOH_PROVIDERS.find(p => p.id === v.id)?.doh ?? DOH_PROVIDERS[0]!.doh
}

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

export const DOH_PROVIDERS: DohProvider[] = [
  { id: 'cloudflare', label: 'Cloudflare', doh: 'https://dns.cloudflare.com/dns-query' },
  { id: 'google',     label: 'Google',     doh: 'https://dns.google/dns-query' },
  { id: 'quad9',      label: 'Quad9',      doh: 'https://dns.quad9.net/dns-query' },
  { id: 'adguard',    label: 'AdGuard',    doh: 'https://dns.adguard-dns.com/dns-query' },
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

import type { DnsProfile, DnsResolver } from '@slave-vpn/dns'
import type { SingboxDnsConfig, SingboxDnsServer } from './types'

function resolverToSingboxAddress(r: DnsResolver): string {
  switch (r.type) {
    case 'doh':
      // sing-box accepts https://... directly
      return r.url.startsWith('https://') ? r.url : `https://${r.url}/dns-query`
    case 'dot':
      // sing-box uses tls:// prefix
      return r.url.startsWith('tls://') ? r.url : `tls://${r.url}`
    case 'tcp':
      return r.url.startsWith('tcp://') ? r.url : `tcp://${r.url}`
    case 'udp':
      // For raw IPs, sing-box accepts them as-is
      return r.url
  }
}

function strategyForSingbox(s: DnsProfile['strategy']): SingboxDnsConfig['strategy'] {
  switch (s) {
    case 'prefer_ipv4': return 'prefer_ipv4'
    case 'ipv4_only':   return 'ipv4_only'
    case 'prefer_ipv6': return 'prefer_ipv6'
    case 'ipv6_only':   return 'ipv6_only'
    default:            return undefined
  }
}

export function compileDns(profile: DnsProfile | undefined): SingboxDnsConfig | undefined {
  if (!profile) return undefined

  const servers: SingboxDnsServer[] = []

  // Primary nameservers (proxy by default — they go through the tunnel)
  profile.nameservers.forEach((r, i) => {
    servers.push({
      tag: `dns_remote_${i}`,
      address: resolverToSingboxAddress(r),
      ...(profile.bootstrapNameservers && profile.bootstrapNameservers.length > 0 ? { address_resolver: 'dns_bootstrap' } : {}),
    })
  })

  // Fallback nameservers (used by leak-prevention rules)
  if (profile.fallbackNameservers) {
    profile.fallbackNameservers.forEach((r, i) => {
      servers.push({
        tag: `dns_fallback_${i}`,
        address: resolverToSingboxAddress(r),
        detour: 'direct',
      })
    })
  }

  // Bootstrap nameservers — used to resolve DoH hostnames themselves.
  // We expose a single "dns_bootstrap" pointing at the first bootstrap entry.
  if (profile.bootstrapNameservers && profile.bootstrapNameservers.length > 0) {
    const first = profile.bootstrapNameservers[0]
    if (first) {
      servers.push({
        tag: 'dns_bootstrap',
        address: resolverToSingboxAddress(first),
        detour: 'direct',
      })
    }
  }

  // Local resolver (for direct outbound queries)
  servers.push({
    tag: 'dns_local',
    address: 'local',
    detour: 'direct',
  })

  const out: SingboxDnsConfig = {
    servers,
    final: servers[0]?.tag ?? 'dns_local',
  }

  const strategy = strategyForSingbox(profile.strategy)
  if (strategy) out.strategy = strategy

  if (profile.fakeIp.enabled) {
    out.fakeip = {
      enabled: true,
      inet4_range: '198.18.0.0/15',
    }
  }

  // Leak prevention rules: queries that pass through direct outbound should
  // hit the local resolver (so they reveal real IP, not the VPN's view).
  // Only emit when fallback is configured.
  if (profile.fallbackNameservers && profile.fallbackNameservers.length > 0) {
    out.rules = [
      { outbound: 'any', server: 'dns_local' },  // any direct → local
    ]
  }

  return out
}

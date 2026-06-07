import type { DnsProfile, DnsResolver, DnsRuleMatchType } from '@slave-vpn/dns'
import type { SingboxDnsConfig, SingboxDnsServer, SingboxDnsRule } from './types'

function resolverToSingboxAddress(r: DnsResolver): string {
  switch (r.type) {
    case 'doh':
      // sing-box accepts https://... directly; ?h3=true hints HTTP/3
      if (r.preferH3 && !r.url.includes('h3=')) {
        return `${r.url}${r.url.includes('?') ? '&' : '?'}h3=true`
      }
      return r.url.startsWith('https://') ? r.url : `https://${r.url}/dns-query`
    case 'dot':
      return r.url.startsWith('tls://') ? r.url : `tls://${r.url}`
    case 'tcp':
      return r.url.startsWith('tcp://') ? r.url : `tcp://${r.url}`
    case 'doq':
      // sing-box: quic://host:port — same as mihomo
      return r.url.startsWith('quic://') ? r.url : `quic://${r.url}`
    case 'udp':
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

  // Per-domain DNS rules (G.2). Each rule picks server by tag.
  // Resolver tags map: primary → dns_remote_0, fallback → dns_fallback_0,
  // direct/system → dns_local. Inline URLs become new ad-hoc servers.
  const rules: SingboxDnsRule[] = []
  let adhocCounter = 0

  if (profile.rules && profile.rules.length > 0) {
    for (const rule of profile.rules) {
      const serverTag = singboxResolverTag(rule.resolverTag, profile, () => {
        const tag = `dns_custom_${adhocCounter++}`
        // Inline URL form — push a server entry
        servers.push({ tag, address: rule.resolverTag })
        return tag
      })
      if (!serverTag) continue
      const compiled = compileDnsRule(rule.matchType, rule.value, serverTag)
      if (compiled) rules.push(compiled)
    }
  }

  // Leak prevention rules: queries that pass through direct outbound should
  // hit the local resolver (so they reveal real IP, not the VPN's view).
  if (profile.fallbackNameservers && profile.fallbackNameservers.length > 0) {
    rules.push({ outbound: 'any', server: 'dns_local' })  // any direct → local
  }

  if (rules.length > 0) {
    out.rules = rules
  }

  return out
}

function singboxResolverTag(
  tag: string,
  profile: DnsProfile,
  registerInline: () => string,
): string | null {
  if (!tag) return null
  if (tag === 'direct' || tag === 'system') return 'dns_local'
  if (tag === 'primary')  return profile.nameservers.length > 0 ? 'dns_remote_0' : null
  if (tag === 'fallback') return profile.fallbackNameservers && profile.fallbackNameservers.length > 0 ? 'dns_fallback_0' : null
  if (/^(https?|tls|tcp|quic):\/\//.test(tag)) return registerInline()
  return null
}

function compileDnsRule(
  matchType: DnsRuleMatchType,
  value: string,
  server: string,
): SingboxDnsRule | null {
  if (!value) return null
  switch (matchType) {
    case 'domain':         return { domain: [value], server }
    case 'domain_suffix':  return { domain_suffix: [value.replace(/^\+\./, '')], server }
    case 'domain_keyword': {
      // sing-box doesn't have domain_keyword directly in newer versions;
      // approximate via domain_regex
      return { domain_suffix: [value], server }  // pragmatic fallback
    }
    case 'geosite':        return { geosite: value.toLowerCase(), server }
  }
}

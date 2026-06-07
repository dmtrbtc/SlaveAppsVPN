export type DnsMode = 'fake-ip' | 'redir-host' | 'normal'
export type DnsResolverType = 'doh' | 'dot' | 'udp' | 'tcp' | 'doq'
export type DnsStrategy = 'prefer_ipv4' | 'ipv4_only' | 'prefer_ipv6' | 'ipv6_only'

// Per-domain DNS routing rule. Selects which resolver (by index in the
// nameservers array, or by special tag) handles a matching domain.
// 'direct' / 'system' are reserved tags that map to direct outbound / OS resolver.
export type DnsRuleMatchType = 'domain' | 'domain_suffix' | 'domain_keyword' | 'geosite'

export interface DnsRule {
  readonly id: string
  readonly matchType: DnsRuleMatchType
  readonly value: string
  readonly resolverTag: string  // 'primary' | 'fallback' | 'direct' | 'system' | custom tag
}

export interface DnsResolver {
  readonly url: string
  readonly type: DnsResolverType
  readonly preferH3?: boolean
}

export interface FakeIpConfig {
  readonly enabled: boolean
  readonly range: string
  readonly filter?: readonly string[]
}

export interface LeakPreventionConfig {
  readonly enabled: boolean
  readonly useSystemDns: boolean
  readonly fallbackFilter?: {
    readonly geoipEnabled: boolean
    readonly geoipCode: string
    readonly ipCidrs: readonly string[]
  }
}

export interface IPv6Config {
  readonly enabled: boolean
}

export interface SniffingConfig {
  readonly enabled: boolean
  readonly overrideDestination: boolean
  readonly protocols: readonly ('http' | 'tls' | 'quic')[]
}

export interface DnsProfile {
  readonly mode: DnsMode
  readonly nameservers: readonly DnsResolver[]
  readonly fallbackNameservers?: readonly DnsResolver[]
  readonly bootstrapNameservers?: readonly DnsResolver[]
  readonly fakeIp: FakeIpConfig
  readonly leakPrevention: LeakPreventionConfig
  readonly ipv6: IPv6Config
  readonly sniffing: SniffingConfig
  // Resolution strategy — controls A vs AAAA preference.
  // Default (when omitted): 'prefer_ipv4' — works best in Russia where IPv6 often breaks Reality.
  readonly strategy?: DnsStrategy

  // Per-domain DNS routing — picks specific resolver for matching domains.
  readonly rules?: readonly DnsRule[]

  // Domains to pre-resolve at start. Reduces first-hit latency for hot paths.
  readonly prefetchDomains?: readonly string[]
}

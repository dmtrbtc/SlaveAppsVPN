// Canonical DNS configuration types (UI/storage shape).
//
// Historically defined in apps/windows/src/shared/ipc/types.ts. Moved into core
// (P0.2b) so the DNS profile model is shared — Android currently has only a
// single DoH provider and gets the full preset/strategy model via core in P2.
// The Windows app re-exports these from core in P0.3 to avoid drift.

export type DnsPresetName = 'secure' | 'balanced' | 'performance' | 'minimal' | 'custom'
export type DnsStrategyName = 'prefer_ipv4' | 'ipv4_only' | 'prefer_ipv6' | 'ipv6_only'
export type DnsResolverKind = 'doh' | 'dot' | 'udp' | 'tcp' | 'doq'
export type DnsRuleMatchKind = 'domain' | 'domain_suffix' | 'domain_keyword' | 'geosite'

export interface CustomDnsResolver {
  id: string
  type: DnsResolverKind
  url: string
  preferH3?: boolean
}

export interface CustomDnsRule {
  id: string
  matchType: DnsRuleMatchKind
  value: string
  resolverTag: string // 'primary' | 'fallback' | 'direct' | 'system' | inline URL | custom resolver id
}

export interface DnsProfileConfig {
  preset: DnsPresetName
  primaryDoh: string
  fallbackDns: string[]
  fakeIpEnabled: boolean
  ipv6Enabled: boolean
  bootstrapDns: string[]
  strategy?: DnsStrategyName
  customResolvers?: CustomDnsResolver[]
  customRules?: CustomDnsRule[]
  prefetchDomains?: string[]
  /** legacy field — kept for backward compat */
  customNameservers?: string[]
}

export interface DnsStrategyInfo {
  value: DnsStrategyName
  label: string
  description: string
}

export interface DnsPresetInfo {
  name: DnsPresetName
  label: string
  description: string
  features: string[]
  nameservers: string[]
  fakeIp: boolean
  ipv6: boolean
}

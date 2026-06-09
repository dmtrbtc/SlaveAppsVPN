import type { DnsProfile, DnsResolver, DnsResolverType, DnsStrategy, DnsRule } from '@slave-vpn/dns'
import { DnsProfilePresets, DEFAULT_FAKE_IP_FILTER } from '@slave-vpn/dns'
import type {
  DnsProfileConfig,
  DnsPresetName,
  DnsStrategyName,
  CustomDnsResolver,
  CustomDnsRule,
} from './types.js'

// ─── url → engine resolver ────────────────────────────────────────────────────
function classifyResolver(url: string): DnsResolverType {
  if (url.startsWith('https://')) return 'doh'
  if (url.startsWith('tls://')) return 'dot'
  if (url.startsWith('tcp://')) return 'tcp'
  return 'udp'
}

function toResolver(url: string): DnsResolver {
  const type = classifyResolver(url)
  return type === 'doh' ? { url, type, preferH3: true } : { url, type }
}

function toEngineStrategy(s?: DnsStrategyName): DnsStrategy | undefined {
  if (!s) return undefined
  return s as DnsStrategy
}

function toEngineResolver(r: CustomDnsResolver): DnsResolver {
  const base: DnsResolver = { url: r.url, type: r.type }
  if (r.type === 'doh' && r.preferH3) return { ...base, preferH3: true }
  return base
}

function toEngineRule(r: CustomDnsRule): DnsRule {
  return {
    id: r.id,
    matchType: r.matchType,
    value: r.value,
    resolverTag: r.resolverTag,
  }
}

// Build a full DnsProfile from a `custom` config (the 'custom' preset).
function customToProfile(custom: DnsProfileConfig): DnsProfile {
  const nameservers: DnsResolver[] = [toResolver(custom.primaryDoh)]
  const fallback: DnsResolver[] = (custom.fallbackDns ?? []).map(toResolver)
  const bootstrap: DnsResolver[] = (custom.bootstrapDns ?? []).map(toResolver)
  const strategy = toEngineStrategy(custom.strategy)

  return {
    mode: custom.fakeIpEnabled ? 'fake-ip' : 'redir-host',
    nameservers,
    ...(fallback.length > 0 ? { fallbackNameservers: fallback } : {}),
    ...(bootstrap.length > 0 ? { bootstrapNameservers: bootstrap } : {}),
    fakeIp: {
      enabled: custom.fakeIpEnabled,
      range: '198.18.0.1/16',
      ...(custom.fakeIpEnabled ? { filter: DEFAULT_FAKE_IP_FILTER } : {}),
    },
    leakPrevention: {
      enabled: true,
      useSystemDns: false,
      fallbackFilter: {
        geoipEnabled: true,
        geoipCode: 'RU',
        ipCidrs: ['240.0.0.0/4', '0.0.0.0/32'],
      },
    },
    ipv6: { enabled: custom.ipv6Enabled },
    ...(strategy ? { strategy } : {}),
    ...(custom.customRules && custom.customRules.length > 0
      ? { rules: custom.customRules.map(toEngineRule) }
      : {}),
    ...(custom.prefetchDomains && custom.prefetchDomains.length > 0
      ? { prefetchDomains: [...custom.prefetchDomains] }
      : {}),
    sniffing: { enabled: true, overrideDestination: false, protocols: ['http', 'tls'] },
  }
}

function withStrategy(profile: DnsProfile, strategy: DnsStrategy | undefined): DnsProfile {
  if (!strategy) return profile
  return { ...profile, strategy }
}

// Layer user customisations (resolvers/rules/prefetch) onto a base preset.
function withCustomisations(base: DnsProfile, custom?: DnsProfileConfig | null): DnsProfile {
  if (!custom) return base
  let next: DnsProfile = base

  if (custom.customResolvers && custom.customResolvers.length > 0) {
    next = { ...next, nameservers: custom.customResolvers.map(toEngineResolver) }
  }
  if (custom.customRules && custom.customRules.length > 0) {
    next = { ...next, rules: custom.customRules.map(toEngineRule) }
  }
  if (custom.prefetchDomains && custom.prefetchDomains.length > 0) {
    next = { ...next, prefetchDomains: [...custom.prefetchDomains] }
  }
  return next
}

/**
 * Resolve a preset name (+ optional custom config + strategy override) into the
 * engine-neutral DnsProfile consumed by the mihomo config generator.
 *
 * Platform-agnostic port of the Windows-only DnsProfileService.buildEngineDnsProfile.
 */
export function resolveDnsProfile(
  preset: DnsPresetName,
  custom?: DnsProfileConfig | null,
  strategyOverride?: DnsStrategyName,
): DnsProfile {
  const strategy = toEngineStrategy(strategyOverride)

  let base: DnsProfile
  switch (preset) {
    case 'secure':
      base = DnsProfilePresets.secure()
      break
    case 'balanced':
      base = DnsProfilePresets.balanced()
      break
    case 'performance':
      base = DnsProfilePresets.performance()
      break
    case 'minimal':
      base = DnsProfilePresets.minimal()
      break
    case 'custom':
      base = custom ? customToProfile(custom) : DnsProfilePresets.secure()
      break
  }

  base = withCustomisations(base, custom)
  base = withStrategy(base, strategy)
  return base
}

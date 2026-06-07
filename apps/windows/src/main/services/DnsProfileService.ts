import type { DnsProfile, DnsResolver, DnsResolverType, DnsStrategy, DnsRule } from '@slave-vpn/dns'
import { DnsProfilePresets, DEFAULT_FAKE_IP_FILTER } from '@slave-vpn/dns'
import type {
  DnsProfileConfig,
  DnsPresetName,
  DnsPresetInfo,
  DnsStrategyName,
  DnsStrategyInfo,
  CustomDnsResolver,
  CustomDnsRule,
} from '../../shared/ipc/types'

export const DNS_STRATEGIES: DnsStrategyInfo[] = [
  {
    value: 'prefer_ipv4',
    label: 'Prefer IPv4',
    description: 'IPv4 предпочтительно; AAAA не блокируется. Лучший баланс для РФ.',
  },
  {
    value: 'ipv4_only',
    label: 'IPv4 only',
    description: 'Только IPv4. Спасает Reality и обходит DPI на v6.',
  },
  {
    value: 'prefer_ipv6',
    label: 'Prefer IPv6',
    description: 'IPv6 предпочтительно. Только если у провайдера native v6.',
  },
  {
    value: 'ipv6_only',
    label: 'IPv6 only',
    description: 'Только IPv6. Может полностью сломать соединение.',
  },
]

export const DNS_PRESETS: DnsPresetInfo[] = [
  {
    name: 'secure',
    label: 'Secure',
    description: 'DoH + H/3 + Fake-IP + утечки заблокированы',
    features: ['DNS-over-HTTPS', 'HTTP/3 (QUIC)', 'Fake-IP режим', 'Защита от утечек', 'No IPv6'],
    nameservers: ['https://8.8.8.8/dns-query', 'https://1.1.1.1/dns-query'],
    fakeIp: true,
    ipv6: false,
  },
  {
    name: 'balanced',
    label: 'Balanced',
    description: 'DoH + UDP fallback + умеренная защита',
    features: ['DNS-over-HTTPS', 'UDP fallback', 'Fake-IP режим', 'Базовая защита'],
    nameservers: ['https://8.8.8.8/dns-query', '8.8.4.4'],
    fakeIp: true,
    ipv6: false,
  },
  {
    name: 'performance',
    label: 'Performance',
    description: 'UDP DNS + параллельные запросы + максимальная скорость',
    features: ['UDP DNS', 'Параллельные запросы', 'Минимальная задержка', 'Fake-IP'],
    nameservers: ['8.8.8.8', '1.1.1.1', '9.9.9.9'],
    fakeIp: true,
    ipv6: false,
  },
  {
    name: 'minimal',
    label: 'Minimal',
    description: 'Только системный DNS + прозрачное проксирование',
    features: ['Системный DNS', 'Без Fake-IP', 'Максимальная совместимость'],
    nameservers: ['8.8.8.8', '1.1.1.1'],
    fakeIp: false,
    ipv6: false,
  },
]

const PRESET_CONFIGS: Record<DnsPresetName, Omit<DnsProfileConfig, 'preset'>> = {
  secure: {
    primaryDoh: 'https://8.8.8.8/dns-query',
    fallbackDns: ['8.8.8.8', '8.8.4.4'],
    fakeIpEnabled: true,
    ipv6Enabled: false,
    bootstrapDns: ['223.5.5.5', '119.29.29.29'],
  },
  balanced: {
    primaryDoh: 'https://8.8.8.8/dns-query',
    fallbackDns: ['8.8.8.8', '8.8.4.4'],
    fakeIpEnabled: true,
    ipv6Enabled: false,
    bootstrapDns: ['8.8.8.8', '1.1.1.1'],
  },
  performance: {
    primaryDoh: '8.8.8.8',
    fallbackDns: ['1.1.1.1', '9.9.9.9'],
    fakeIpEnabled: true,
    ipv6Enabled: false,
    bootstrapDns: ['8.8.8.8'],
  },
  minimal: {
    primaryDoh: '8.8.8.8',
    fallbackDns: ['1.1.1.1'],
    fakeIpEnabled: false,
    ipv6Enabled: false,
    bootstrapDns: [],
  },
  custom: {
    primaryDoh: 'https://8.8.8.8/dns-query',
    fallbackDns: ['8.8.8.8'],
    fakeIpEnabled: true,
    ipv6Enabled: false,
    bootstrapDns: [],
  },
}

export function buildDnsProfileConfig(preset: DnsPresetName, custom?: DnsProfileConfig | null): DnsProfileConfig {
  if (preset === 'custom' && custom) return custom
  return { preset, ...PRESET_CONFIGS[preset] }
}

export function getPresets(): DnsPresetInfo[] {
  return DNS_PRESETS
}

// ─── Bridge: preset name → engine-neutral DnsProfile ─────────────────────────
// Used by RuntimeServiceImpl to build the DnsProfile passed into the engine.

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
    sniffing: {
      enabled: true,
      overrideDestination: false,
      protocols: ['http', 'tls'],
    },
  }
}

// Apply user-selected strategy on top of a preset profile (overrides preset default).
function withStrategy(profile: DnsProfile, strategy: DnsStrategy | undefined): DnsProfile {
  if (!strategy) return profile
  return { ...profile, strategy }
}

// Convert UI CustomDnsResolver → engine DnsResolver.
function toEngineResolver(r: CustomDnsResolver): DnsResolver {
  const base: DnsResolver = { url: r.url, type: r.type }
  if (r.type === 'doh' && r.preferH3) return { ...base, preferH3: true }
  return base
}

// Convert UI CustomDnsRule → engine DnsRule.
function toEngineRule(r: CustomDnsRule): DnsRule {
  return {
    id: r.id,
    matchType: r.matchType,
    value: r.value,
    resolverTag: r.resolverTag,
  }
}

// Merge user customisations (resolvers/rules/prefetch) into a base preset profile.
function withCustomisations(base: DnsProfile, custom?: DnsProfileConfig | null): DnsProfile {
  if (!custom) return base
  let next: DnsProfile = base

  // Custom resolvers replace primary nameservers if non-empty
  if (custom.customResolvers && custom.customResolvers.length > 0) {
    const ns = custom.customResolvers.map(toEngineResolver)
    next = { ...next, nameservers: ns }
  }

  if (custom.customRules && custom.customRules.length > 0) {
    next = { ...next, rules: custom.customRules.map(toEngineRule) }
  }

  if (custom.prefetchDomains && custom.prefetchDomains.length > 0) {
    next = { ...next, prefetchDomains: [...custom.prefetchDomains] }
  }

  return next
}

export function buildEngineDnsProfile(
  preset: DnsPresetName,
  custom?: DnsProfileConfig | null,
  strategyOverride?: DnsStrategyName,
): DnsProfile {
  const strategy = toEngineStrategy(strategyOverride)

  // Pick base profile from preset
  let base: DnsProfile
  switch (preset) {
    case 'secure':      base = DnsProfilePresets.secure();      break
    case 'balanced':    base = DnsProfilePresets.balanced();    break
    case 'performance': base = DnsProfilePresets.performance(); break
    case 'minimal':     base = DnsProfilePresets.minimal();     break
    case 'custom':
      base = custom ? customToProfile(custom) : DnsProfilePresets.secure()
      break
  }

  // Layer user customisations on top — works for ALL presets, not just custom
  base = withCustomisations(base, custom)
  base = withStrategy(base, strategy)
  return base
}

export function getStrategies(): DnsStrategyInfo[] {
  return DNS_STRATEGIES
}

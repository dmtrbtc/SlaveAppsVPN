import type { DnsPresetName, DnsPresetInfo, DnsStrategyInfo, DnsProfileConfig } from './types.js'

// Ported verbatim from the Windows DnsProfileService so both platforms share one
// preset catalogue. UI labels stay in Russian (the app's language).

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

export const DNS_PRESET_CONFIGS: Record<DnsPresetName, Omit<DnsProfileConfig, 'preset'>> = {
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

export function buildDnsProfileConfig(
  preset: DnsPresetName,
  custom?: DnsProfileConfig | null,
): DnsProfileConfig {
  if (preset === 'custom' && custom) return custom
  return { preset, ...DNS_PRESET_CONFIGS[preset] }
}

export function getDnsPresets(): DnsPresetInfo[] {
  return DNS_PRESETS
}

export function getDnsStrategies(): DnsStrategyInfo[] {
  return DNS_STRATEGIES
}

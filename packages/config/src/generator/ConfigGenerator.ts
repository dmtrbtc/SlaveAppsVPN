import yaml from 'js-yaml'
import type { VPNMode } from '@slave-vpn/shared'
import type { NormalizedPolicy } from '@slave-vpn/routing'
import { MihomoRuleCompiler } from '@slave-vpn/routing'
import type { DnsProfile } from '@slave-vpn/dns'
import { MihomoDnsCompiler } from '@slave-vpn/dns'
import { SubscriptionParser } from '../parser/SubscriptionParser'
import type { ParsedProxy, ParsedProxyGroup } from '../parser/ParsedProfile'

export interface GeneratorSettings {
  tunEnabled: boolean
  tunStack: 'mixed' | 'gvisor' | 'system'
  fakeIpEnabled: boolean
  dnsOverHttps: string
  fallbackDns: string[]
  mixedPort: number
  splitTunnelProcesses?: string[]
}

export interface ConfigGenerationContext {
  subscriptionYaml: string
  selectedProxy?: string
  vpnMode: VPNMode
  settings: GeneratorSettings
  apiPort: number
  apiSecret: string
  routingPolicy?: NormalizedPolicy
  dnsProfile?: DnsProfile
}

const SLAVE_SELECT_GROUP = 'SLAVE-SELECT'
const SLAVE_AUTO_GROUP = 'SLAVE-AUTO'
const URL_TEST_URL = 'http://www.gstatic.com/generate_204'
const URL_TEST_INTERVAL = 300

const dnsCompiler = new MihomoDnsCompiler()
const ruleCompiler = new MihomoRuleCompiler()

export function generateMihomoConfig(ctx: ConfigGenerationContext): string {
  const parser = new SubscriptionParser()
  const profile = parser.parse(ctx.subscriptionYaml)

  const proxyNames = profile.proxies.map((p) => p.name)

  const managedGroups: ParsedProxyGroup[] = [
    {
      name: SLAVE_SELECT_GROUP,
      type: 'select',
      proxies: [SLAVE_AUTO_GROUP, ...proxyNames],
    },
    {
      name: SLAVE_AUTO_GROUP,
      type: 'url-test',
      proxies: proxyNames.length > 0 ? proxyNames : ['DIRECT'],
      url: URL_TEST_URL,
      interval: URL_TEST_INTERVAL,
    },
  ]

  const rules = ctx.routingPolicy
    ? ruleCompiler.compile(ctx.routingPolicy, { proxyGroupName: SLAVE_SELECT_GROUP }).rules
    : buildLegacyRules(ctx.vpnMode, ctx.settings.splitTunnelProcesses)

  const config: Record<string, unknown> = {
    'mixed-port': ctx.settings.mixedPort,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    'unified-delay': true,
    'tcp-concurrent': true,
    'external-controller': `127.0.0.1:${ctx.apiPort}`,
    secret: ctx.apiSecret,
    proxies: profile.proxies as unknown[],
    'proxy-groups': [
      ...managedGroups,
      // Filter out groups with no proxies — mihomo rejects empty select/url-test groups
      ...profile.proxyGroups.filter(g => g.proxies.length > 0),
    ] as unknown[],
    rules,
  }

  if (ctx.settings.tunEnabled) {
    config['tun'] = buildTunSection(ctx.settings)
    config['sniffer'] = buildSnifferSection()
  }

  config['dns'] = ctx.dnsProfile
    ? dnsCompiler.compile(ctx.dnsProfile).config
    : buildLegacyDnsSection(ctx.settings)

  config['profile'] = { 'store-selected': true, 'store-fake-ip': false }

  return yaml.dump(config, { lineWidth: -1, noRefs: true })
}

function buildTunSection(settings: GeneratorSettings): Record<string, unknown> {
  return {
    enable: true,
    stack: settings.tunStack,
    device: 'Mihomo',
    mtu: 9000,
    'dns-hijack': ['any:53'],
    'auto-route': true,
    'strict-route': true,
    'auto-detect-interface': true,
  }
}

function buildSnifferSection(): Record<string, unknown> {
  return {
    enable: true,
    sniff: {
      TLS: { ports: [443, 8443] },
      HTTP: { ports: [80, '8080-8880'], 'override-destination': true },
      QUIC: { ports: [443, 8443] },
    },
    'skip-domain': [
      '+.push.apple.com',
      '+.apple.com',
      'Mijia Cloud',
    ],
  }
}

// Domains that MUST get real IPs (fake-ip breaks them)
const FAKE_IP_FILTER = [
  '*.lan',
  '*.local',
  '*.localhost',
  'localhost.ptlogin2.qq.com',
  '*.msftconnecttest.com',
  '*.msftncsi.com',
  'time.*.com',
  'time.*.gov',
  'ntp.*.com',
  '*.ntp.org.cn',
  'time.cloudflare.com',
  '*.apple.com',
  'gateway.icloud.com',
  '*.srv.nintendo.net',
  '*.stun.*.*',
  'stun.*.*',
]

function buildLegacyDnsSection(settings: GeneratorSettings): Record<string, unknown> {
  return {
    enable: true,
    // Port 53 is occupied by Windows DNS Client on many systems; use a
    // non-conflicting port. TUN dns-hijack intercepts at packet level
    // and does not depend on this listen address.
    listen: '0.0.0.0:1053',
    ipv6: false,
    'use-system-hosts': false,
    'enhanced-mode': settings.fakeIpEnabled ? 'fake-ip' : 'normal',
    ...(settings.fakeIpEnabled ? {
      'fake-ip-range': '198.18.0.1/16',
      'fake-ip-filter': FAKE_IP_FILTER,
    } : {}),
    nameserver: [
      settings.dnsOverHttps,
      'https://1.1.1.1/dns-query',
    ],
    fallback: ['8.8.8.8', '1.1.1.1', ...settings.fallbackDns],
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
    },
  }
}

// Private IP ranges — always direct regardless of mode to prevent routing loops.
// GEOIP,private is Mihomo built-in and does NOT require geoip.dat.
const PRIVATE_DIRECT_RULES = [
  'GEOIP,private,DIRECT,no-resolve',
  'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,10.0.0.0/8,DIRECT,no-resolve',
  'IP-CIDR,172.16.0.0/12,DIRECT,no-resolve',
  'IP-CIDR,192.168.0.0/16,DIRECT,no-resolve',
  'IP-CIDR,169.254.0.0/16,DIRECT,no-resolve',
  'IP-CIDR,224.0.0.0/4,DIRECT,no-resolve',
  'IP-CIDR,240.0.0.0/4,DIRECT,no-resolve',
]

function buildLegacyRules(mode: VPNMode, splitProcesses?: string[]): string[] {
  switch (mode) {
    case 'full':
      return [
        ...PRIVATE_DIRECT_RULES,
        `MATCH,${SLAVE_SELECT_GROUP}`,
      ]

    case 'bypass':
      // All non-private traffic through VPN.
      // Geo-based bypass (RU, CN) requires geoip.dat/geosite.dat which must be
      // packaged separately — added when geo data is available.
      return [
        ...PRIVATE_DIRECT_RULES,
        `MATCH,${SLAVE_SELECT_GROUP}`,
      ]

    case 'split':
      return [
        ...(splitProcesses ?? []).map((p) => `PROCESS-NAME,${p},${SLAVE_SELECT_GROUP}`),
        ...PRIVATE_DIRECT_RULES,
        'MATCH,DIRECT',
      ]

    case 'custom':
      return [
        ...PRIVATE_DIRECT_RULES,
        `MATCH,${SLAVE_SELECT_GROUP}`,
      ]
  }
}

export function getAutoSelectGroupName(): string {
  return SLAVE_AUTO_GROUP
}

export function getSelectGroupName(): string {
  return SLAVE_SELECT_GROUP
}

export function getProxyNamesFromYaml(subscriptionYaml: string): string[] {
  try {
    const parser = new SubscriptionParser()
    const profile = parser.parse(subscriptionYaml)
    return profile.proxies.map((p: ParsedProxy) => p.name)
  } catch {
    return []
  }
}

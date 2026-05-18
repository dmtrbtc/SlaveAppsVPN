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
  }

  config['dns'] = ctx.dnsProfile
    ? dnsCompiler.compile(ctx.dnsProfile).config
    : buildLegacyDnsSection(ctx.settings)

  return yaml.dump(config, { lineWidth: -1, noRefs: true })
}

function buildTunSection(settings: GeneratorSettings): Record<string, unknown> {
  return {
    enable: true,
    stack: settings.tunStack,
    'dns-hijack': ['any:53'],
    'auto-route': true,
    'auto-detect-interface': true,
  }
}

function buildLegacyDnsSection(settings: GeneratorSettings): Record<string, unknown> {
  return {
    enable: true,
    'enhanced-mode': settings.fakeIpEnabled ? 'fake-ip' : 'normal',
    ...(settings.fakeIpEnabled ? { 'fake-ip-range': '198.18.0.1/16' } : {}),
    nameserver: [settings.dnsOverHttps],
    fallback: settings.fallbackDns,
    'fallback-filter': {
      geoip: true,
      'geoip-code': 'CN',
    },
  }
}

function buildLegacyRules(mode: VPNMode, splitProcesses?: string[]): string[] {
  switch (mode) {
    case 'full':
      return [`MATCH,${SLAVE_SELECT_GROUP}`]

    case 'bypass':
      return [
        'GEOSITE,private,DIRECT',
        'GEOSITE,cn,DIRECT',
        'GEOIP,private,DIRECT,no-resolve',
        'GEOIP,CN,DIRECT',
        `MATCH,${SLAVE_SELECT_GROUP}`,
      ]

    case 'split':
      return [
        ...(splitProcesses ?? []).map((p) => `PROCESS-NAME,${p},${SLAVE_SELECT_GROUP}`),
        'MATCH,DIRECT',
      ]

    case 'custom':
      return [`MATCH,${SLAVE_SELECT_GROUP}`]
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

import type { ConfigGenerationContext } from '../../generator/ConfigGenerator'
import { SubscriptionParser } from '../../parser/SubscriptionParser'
import { compileOutbound } from './protocols'
import { compileRoutingRules, PRIVATE_DIRECT_RULES } from './routing'
import { compileDns } from './dns'
import type {
  SingboxConfig,
  SingboxOutbound,
  SingboxInbound,
  SingboxTunInbound,
  SingboxMixedInbound,
  SingboxRouteRule,
} from './types'

const SLAVE_SELECT_GROUP = 'SLAVE-SELECT'
const SLAVE_AUTO_GROUP = 'SLAVE-AUTO'
const URL_TEST_URL = 'http://www.gstatic.com/generate_204'
const URL_TEST_INTERVAL = '5m'

function buildInbounds(ctx: ConfigGenerationContext): SingboxInbound[] {
  const inbounds: SingboxInbound[] = []

  // Mixed inbound — local SOCKS+HTTP for clients that don't use TUN
  const mixed: SingboxMixedInbound = {
    type: 'mixed',
    tag: 'mixed-in',
    listen: '127.0.0.1',
    listen_port: ctx.settings.mixedPort,
    sniff: true,
    sniff_override_destination: true,
  }
  inbounds.push(mixed)

  if (ctx.settings.tunEnabled) {
    const stack = ctx.settings.tunStack === 'mixed'
      ? 'mixed' as const
      : ctx.settings.tunStack === 'gvisor'
      ? 'gvisor' as const
      : 'system' as const

    const tun: SingboxTunInbound = {
      type: 'tun',
      tag: 'tun-in',
      interface_name: 'slave-tun',
      stack,
      mtu: 9000,
      auto_route: true,
      strict_route: true,
      inet4_address: ['172.19.0.1/30'],
      sniff: true,
    }
    inbounds.push(tun)
  }

  return inbounds
}

function buildGroupOutbounds(proxyTags: string[], selectedProxy?: string): SingboxOutbound[] {
  const tags = proxyTags.length > 0 ? proxyTags : ['direct']

  const selectGroup: SingboxOutbound = {
    type: 'selector',
    tag: SLAVE_SELECT_GROUP,
    outbounds: [SLAVE_AUTO_GROUP, ...tags],
    ...(selectedProxy && tags.includes(selectedProxy) ? { default: selectedProxy } : {}),
  }

  const autoGroup: SingboxOutbound = {
    type: 'urltest',
    tag: SLAVE_AUTO_GROUP,
    outbounds: tags,
    url: URL_TEST_URL,
    interval: URL_TEST_INTERVAL,
  }

  return [selectGroup, autoGroup]
}

export function generateSingboxConfig(ctx: ConfigGenerationContext): string {
  const parser = new SubscriptionParser()
  const profile = parser.parse(ctx.subscriptionYaml)

  const protocolOutbounds: SingboxOutbound[] = []
  const skipped: string[] = []

  for (const proxy of profile.proxies) {
    const out = compileOutbound(proxy)
    if (out) protocolOutbounds.push(out)
    else skipped.push(`${proxy.name} (${proxy.type})`)
  }

  if (protocolOutbounds.length === 0) {
    throw new Error(`SingBox: no usable outbounds compiled from ${profile.proxies.length} proxies` +
      (skipped.length > 0 ? `; skipped: ${skipped.slice(0, 5).join(', ')}` : ''))
  }

  const proxyTags = protocolOutbounds.map(p => p.tag)
  const groupOutbounds = buildGroupOutbounds(proxyTags, ctx.selectedProxy)

  // Built-in outbounds — sing-box always needs `direct` and `block`
  const builtins: SingboxOutbound[] = [
    { type: 'direct', tag: 'direct' },
    { type: 'block', tag: 'block' },
    { type: 'dns', tag: 'dns-out' },
  ]

  const outbounds: SingboxOutbound[] = [
    ...groupOutbounds,
    ...protocolOutbounds,
    ...builtins,
  ]

  // Routing
  const { rules: scenarioRules, finalOutbound } = compileRoutingRules(ctx.routingPolicy, SLAVE_SELECT_GROUP)

  const dnsRule: SingboxRouteRule = { protocol: ['dns'], outbound: 'dns-out' }
  const routeRules: SingboxRouteRule[] = [
    dnsRule,
    ...PRIVATE_DIRECT_RULES,
    ...scenarioRules,
  ]

  const config: SingboxConfig = {
    log: { level: 'info', timestamp: true },
    inbounds: buildInbounds(ctx),
    outbounds,
    route: {
      rules: routeRules,
      final: finalOutbound,
      auto_detect_interface: true,
      ...(ctx.rulesDir ? {
        geoip:   { path: `${ctx.rulesDir.replace(/\\/g, '/')}/geoip.db` },
        geosite: { path: `${ctx.rulesDir.replace(/\\/g, '/')}/geosite.db` },
      } : {}),
    },
    experimental: {
      clash_api: {
        external_controller: `127.0.0.1:${ctx.apiPort}`,
        ...(ctx.apiSecret ? { secret: ctx.apiSecret } : {}),
        store_selected: true,
        cache_file: 'cache.db',
      },
    },
  }

  const dns = compileDns(ctx.dnsProfile)
  if (dns) config.dns = dns

  // Skipped logs swallowed silently — caller logs at engine level if needed
  void skipped
  // Pretty-printed JSON — sing-box config files are typically human-readable
  return JSON.stringify(config, null, 2)
}

export function getSlaveSelectGroup(): string {
  return SLAVE_SELECT_GROUP
}

export function getSlaveAutoGroup(): string {
  return SLAVE_AUTO_GROUP
}

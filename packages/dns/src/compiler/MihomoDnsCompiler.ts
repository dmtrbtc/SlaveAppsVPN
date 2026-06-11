import type { DnsCompiler, CompiledDnsOutput } from './DnsCompiler'
import type { DnsProfile, DnsResolver, DnsStrategy } from '../profiles/DnsProfile'

// Resolves the effective IPv6 toggle from explicit ipv6 flag + strategy override.
// strategy wins if present, since it conveys more user intent.
function resolveIPv6Enabled(profile: DnsProfile): boolean {
  const strategy = profile.strategy
  if (strategy === 'ipv4_only') return false
  if (strategy === 'ipv6_only') return true
  if (strategy === 'prefer_ipv6') return true
  if (strategy === 'prefer_ipv4') return profile.ipv6.enabled
  return profile.ipv6.enabled
}

// Mihomo doesn't have a first-class "strategy" knob; the effective behavior is
// achieved via the ipv6 flag (resolved above). This hook is kept as an extension
// point in case future Mihomo versions add `prefer-ipv4`-like options.
function applyStrategy(config: Record<string, unknown>, strategy: DnsStrategy | undefined): void {
  void config
  void strategy
}

export class MihomoDnsCompiler implements DnsCompiler {
  readonly compilerType = 'mihomo'

  compile(profile: DnsProfile): CompiledDnsOutput {
    const config: Record<string, unknown> = {
      enable: true,
      listen: '0.0.0.0:1053',
      ipv6: resolveIPv6Enabled(profile),
      'use-system-hosts': false,
      'default-nameserver': (profile.defaultNameservers ?? profile.bootstrapNameservers ?? profile.nameservers).map(resolverUrl),
      'enhanced-mode': profile.mode,
      nameserver: profile.nameservers.map(resolverUrl),
    }

    if (profile.preferH3 !== undefined) config['prefer-h3'] = profile.preferH3

    applyStrategy(config, profile.strategy)

    if (profile.fakeIp.enabled) {
      config['fake-ip-range'] = profile.fakeIp.range
      if (profile.fakeIp.filter && profile.fakeIp.filter.length > 0) {
        config['fake-ip-filter'] = [...profile.fakeIp.filter]
      }
    }

    if (profile.fallbackNameservers && profile.fallbackNameservers.length > 0) {
      config['fallback'] = profile.fallbackNameservers.map(resolverUrl)
      if (profile.leakPrevention.enabled && profile.leakPrevention.fallbackFilter) {
        const ff = profile.leakPrevention.fallbackFilter
        config['fallback-filter'] = {
          geoip: ff.geoipEnabled,
          'geoip-code': ff.geoipCode,
          ipcidr: [...ff.ipCidrs],
        }
      }
    }

    if (!profile.leakPrevention.useSystemDns) {
      config['respect-rules'] = true
      // mihomo hard-requires a non-empty `proxy-server-nameserver` whenever
      // `respect-rules` is on (else it fatals at parse time). This pool resolves
      // the proxy server hostnames themselves and MUST bypass the rule engine to
      // avoid a chicken-and-egg loop, so it uses the direct bootstrap resolvers
      // (falling back to the primary nameservers).
      const proxyServerNs = (profile.proxyServerNameservers ?? profile.bootstrapNameservers ?? profile.nameservers).map(resolverUrl)
      config['proxy-server-nameserver'] = proxyServerNs.length > 0
        ? proxyServerNs
        : ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query']
    }

    if (profile.sniffing.enabled) {
      config['use-hosts'] = false
    }

    // Per-domain DNS policy (G.2): { "+.openai.com": "https://...", "geosite:cn": "system" }
    // Resolver tags: 'primary' → first nameserver; 'fallback' → first fallback;
    // anything starting with https://, tls://, quic:// → used as-is.
    if (profile.rules && profile.rules.length > 0) {
      const policy: Record<string, string | string[]> = {}
      for (const rule of profile.rules) {
        const key = mihomoRuleKey(rule.matchType, rule.value)
        const value = resolveRuleTargets(rule.resolverTag, profile)
        if (key && value) policy[key] = value
      }
      if (Object.keys(policy).length > 0) {
        config['nameserver-policy'] = policy
      }
    }

    // DNS warming / prefetch (G.4) — pre-resolve these domains at start
    if (profile.prefetchDomains && profile.prefetchDomains.length > 0) {
      config['prefetch-domain'] = [...profile.prefetchDomains]
    }

    return {
      config,
      metadata: {
        compiler: this.compilerType,
        compiledAt: new Date(),
      },
    }
  }
}

// Map internal rule match type to mihomo nameserver-policy key syntax.
// mihomo accepts: "example.com" (exact), "+.example.com" (suffix),
// "*.example.com" (wildcard), "geosite:cn", "rule-set:..."
function mihomoRuleKey(matchType: import('../profiles/DnsProfile').DnsRuleMatchType, value: string): string | null {
  if (!value) return null
  switch (matchType) {
    case 'domain':         return value
    case 'domain_suffix':  return `+.${value.replace(/^\+\./, '')}`
    case 'domain_keyword': return `*${value}*`
    case 'geosite':        return `geosite:${value.toLowerCase()}`
  }
}

// Resolve a rule's target(s) to mihomo nameserver-policy value(s). A single
// target collapses to a string; multiple targets emit an array (e.g. RU →
// [77.88.8.8, 8.8.8.8]). Unresolvable entries are dropped.
function resolveRuleTargets(
  tag: string | readonly string[],
  profile: import('../profiles/DnsProfile').DnsProfile,
): string | string[] | null {
  const tags = Array.isArray(tag) ? tag : [tag as string]
  const out: string[] = []
  for (const t of tags) {
    const r = resolveRuleTarget(t, profile)
    if (r) out.push(r)
  }
  if (out.length === 0) return null
  return out.length === 1 ? out[0]! : out
}

function resolveRuleTarget(tag: string, profile: import('../profiles/DnsProfile').DnsProfile): string | null {
  if (!tag) return null
  if (tag === 'direct' || tag === 'system') return 'system'
  if (tag === 'primary')  return profile.nameservers[0] ? resolverUrl(profile.nameservers[0]) : null
  if (tag === 'fallback' && profile.fallbackNameservers && profile.fallbackNameservers[0]) {
    return resolverUrl(profile.fallbackNameservers[0])
  }
  // Inline absolute URL — pass through
  if (/^(https?|tls|tcp|quic):\/\//.test(tag)) return tag
  // Plain IPv4 (optionally :port) or bracketed IPv6 / udp:// resolver — pass through
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(tag) || /^(udp:\/\/|\[)/.test(tag)) return tag
  return null
}

function resolverUrl(resolver: DnsResolver): string {
  switch (resolver.type) {
    case 'doh': {
      const base = resolver.url
      return resolver.preferH3 ? `${base}#h3=true` : base
    }
    case 'dot':
      return resolver.url.startsWith('tls://') ? resolver.url : `tls://${resolver.url}`
    case 'tcp':
      return resolver.url.startsWith('tcp://') ? resolver.url : `tcp://${resolver.url}`
    case 'doq':
      return resolver.url.startsWith('quic://') ? resolver.url : `quic://${resolver.url}`
    case 'udp':
      return resolver.url
  }
}

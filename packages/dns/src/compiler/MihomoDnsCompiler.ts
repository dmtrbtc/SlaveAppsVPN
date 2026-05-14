import type { DnsCompiler, CompiledDnsOutput } from './DnsCompiler'
import type { DnsProfile, DnsResolver } from '../profiles/DnsProfile'

export class MihomoDnsCompiler implements DnsCompiler {
  readonly compilerType = 'mihomo'

  compile(profile: DnsProfile): CompiledDnsOutput {
    const config: Record<string, unknown> = {
      enable: true,
      listen: '0.0.0.0:1053',
      ipv6: profile.ipv6.enabled,
      'use-system-hosts': false,
      'default-nameserver': (profile.bootstrapNameservers ?? profile.nameservers).map(resolverUrl),
      'enhanced-mode': profile.mode,
      nameserver: profile.nameservers.map(resolverUrl),
    }

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
    }

    if (profile.sniffing.enabled) {
      config['use-hosts'] = false
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
    case 'udp':
      return resolver.url
  }
}

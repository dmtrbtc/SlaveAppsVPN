import type { DnsProfile, DnsResolver } from './DnsProfile'
import { DEFAULT_FAKE_IP_FILTER } from './FakeIpFilter'

const DOH_GOOGLE: DnsResolver = { url: 'https://dns.google/dns-query', type: 'doh', preferH3: true }
const DOH_CLOUDFLARE: DnsResolver = { url: 'https://cloudflare-dns.com/dns-query', type: 'doh', preferH3: true }
const DOT_GOOGLE: DnsResolver = { url: 'tls://dns.google', type: 'dot' }
const DOT_CLOUDFLARE: DnsResolver = { url: 'tls://1dot1dot1dot1.cloudflare-dns.com', type: 'dot' }
const UDP_GOOGLE: DnsResolver = { url: '8.8.8.8', type: 'udp' }
const UDP_CLOUDFLARE: DnsResolver = { url: '1.1.1.1', type: 'udp' }
const UDP_GOOGLE_ALT: DnsResolver = { url: '8.8.4.4', type: 'udp' }

const BOOTSTRAP: readonly DnsResolver[] = [UDP_GOOGLE, UDP_CLOUDFLARE, UDP_GOOGLE_ALT]

const FALLBACK_FILTER = {
  geoipEnabled: true,
  geoipCode: 'RU',
  ipCidrs: ['240.0.0.0/4', '0.0.0.0/32'],
} as const

export const DnsProfilePresets = {
  secure(): DnsProfile {
    return {
      mode: 'fake-ip',
      nameservers: [DOH_GOOGLE, DOH_CLOUDFLARE],
      fallbackNameservers: [DOT_GOOGLE, DOT_CLOUDFLARE],
      bootstrapNameservers: BOOTSTRAP,
      fakeIp: {
        enabled: true,
        range: '198.18.0.1/16',
        filter: DEFAULT_FAKE_IP_FILTER,
      },
      leakPrevention: {
        enabled: true,
        useSystemDns: false,
        fallbackFilter: FALLBACK_FILTER,
      },
      ipv6: { enabled: false },
      strategy: 'prefer_ipv4',
      sniffing: {
        enabled: true,
        overrideDestination: true,
        protocols: ['http', 'tls', 'quic'],
      },
    }
  },

  balanced(): DnsProfile {
    return {
      mode: 'fake-ip',
      nameservers: [DOH_CLOUDFLARE, UDP_GOOGLE],
      fallbackNameservers: [DOT_GOOGLE],
      bootstrapNameservers: BOOTSTRAP,
      fakeIp: {
        enabled: true,
        range: '198.18.0.1/16',
        filter: DEFAULT_FAKE_IP_FILTER,
      },
      leakPrevention: {
        enabled: true,
        useSystemDns: false,
        fallbackFilter: FALLBACK_FILTER,
      },
      ipv6: { enabled: false },
      strategy: 'prefer_ipv4',
      sniffing: {
        enabled: true,
        overrideDestination: false,
        protocols: ['http', 'tls'],
      },
    }
  },

  performance(): DnsProfile {
    return {
      mode: 'fake-ip',
      nameservers: [UDP_GOOGLE, UDP_CLOUDFLARE, UDP_GOOGLE_ALT],
      fallbackNameservers: [DOH_CLOUDFLARE],
      bootstrapNameservers: BOOTSTRAP,
      fakeIp: {
        enabled: true,
        range: '198.18.0.1/16',
        filter: DEFAULT_FAKE_IP_FILTER,
      },
      leakPrevention: {
        enabled: true,
        useSystemDns: false,
        fallbackFilter: FALLBACK_FILTER,
      },
      ipv6: { enabled: false },
      strategy: 'prefer_ipv4',
      sniffing: {
        enabled: true,
        overrideDestination: false,
        protocols: ['tls'],
      },
    }
  },

  minimal(): DnsProfile {
    return {
      mode: 'redir-host',
      nameservers: [UDP_GOOGLE, UDP_CLOUDFLARE],
      bootstrapNameservers: BOOTSTRAP,
      fakeIp: {
        enabled: false,
        range: '198.18.0.1/16',
      },
      leakPrevention: {
        enabled: false,
        useSystemDns: true,
      },
      ipv6: { enabled: false },
      strategy: 'prefer_ipv4',
      sniffing: {
        enabled: false,
        overrideDestination: false,
        protocols: [],
      },
    }
  },
} as const

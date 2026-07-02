import type { DnsProfile, DnsResolver } from './DnsProfile'
import { DEFAULT_FAKE_IP_FILTER } from './FakeIpFilter'

// IP-literal DoH endpoints (not hostnames) so the resolver needs no plaintext
// bootstrap that a hostile ISP could hijack/poison — the cert carries the IP in
// its SAN, so TLS validates directly. Mirrors the cross-platform DOH_PROVIDERS.
const DOH_GOOGLE: DnsResolver = { url: 'https://8.8.8.8/dns-query', type: 'doh', preferH3: true }
const DOH_CLOUDFLARE: DnsResolver = { url: 'https://1.1.1.1/dns-query', type: 'doh', preferH3: true }
// DoT fallbacks are IP-literal too (v0.2.34): hostname DoT (`tls://dns.google`)
// needs the same plaintext bootstrap resolution a hostile ISP can poison — the
// exact vector the v0.2.19 IP-literal DoH fix closed. Google/Cloudflare DoT
// certs carry the IP in their SAN, so TLS validates without any resolution.
const DOT_GOOGLE: DnsResolver = { url: 'tls://8.8.8.8', type: 'dot' }
const DOT_CLOUDFLARE: DnsResolver = { url: 'tls://1.1.1.1', type: 'dot' }
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

// Sing-box config schema (subset). We only emit fields we actually use; sing-box
// applies sensible defaults for the rest.

export interface SingboxTlsConfig {
  enabled: boolean
  server_name?: string
  insecure?: boolean
  alpn?: string[]
  utls?: {
    enabled: boolean
    fingerprint?: string
  }
  reality?: {
    enabled: boolean
    public_key: string
    short_id?: string
  }
}

export interface SingboxTransport {
  type: 'ws' | 'grpc' | 'http' | 'httpupgrade' | 'quic'
  path?: string
  headers?: Record<string, string>
  service_name?: string  // grpc
  host?: string[]        // http (multi-host)
}

export interface SingboxOutboundBase {
  type: string
  tag: string
  server?: string
  server_port?: number
}

export interface SingboxOutbound extends SingboxOutboundBase {
  // Protocol-specific fields lump into one type; the compiler emits only what's relevant
  uuid?: string
  password?: string
  flow?: string
  method?: string
  alter_id?: number
  security?: string
  congestion_control?: string
  // WireGuard
  private_key?: string
  peer_public_key?: string
  pre_shared_key?: string
  local_address?: string[]
  mtu?: number
  // Common nested
  tls?: SingboxTlsConfig
  transport?: SingboxTransport
  // For obfs (hysteria2)
  obfs?: { type: string; password?: string }
  // For selector / urltest groups
  outbounds?: string[]
  default?: string
  url?: string
  interval?: string
}

export interface SingboxInboundBase {
  type: string
  tag: string
}

export interface SingboxTunInbound extends SingboxInboundBase {
  type: 'tun'
  interface_name?: string
  stack: 'system' | 'gvisor' | 'mixed'
  inet4_address?: string[]
  inet6_address?: string[]
  mtu: number
  auto_route: boolean
  strict_route: boolean
  endpoint_independent_nat?: boolean
  sniff?: boolean
}

export interface SingboxMixedInbound extends SingboxInboundBase {
  type: 'mixed'
  listen: string
  listen_port: number
  sniff?: boolean
  sniff_override_destination?: boolean
}

export type SingboxInbound = SingboxTunInbound | SingboxMixedInbound

export interface SingboxRouteRule {
  domain?: string[]
  domain_suffix?: string[]
  domain_keyword?: string[]
  domain_regex?: string[]
  ip_cidr?: string[]
  source_ip_cidr?: string[]
  port?: number[]
  process_name?: string[]
  network?: 'tcp' | 'udp'
  geosite?: string | string[]
  geoip?: string | string[]
  protocol?: string | string[]
  outbound: string
  invert?: boolean
}

export interface SingboxDnsServer {
  tag: string
  address: string
  address_resolver?: string
  detour?: string
  strategy?: 'prefer_ipv4' | 'ipv4_only' | 'prefer_ipv6' | 'ipv6_only'
}

export interface SingboxDnsRule {
  domain?: string[]
  domain_suffix?: string[]
  outbound?: 'any' | string
  geosite?: string | string[]
  server: string
}

export interface SingboxDnsConfig {
  servers: SingboxDnsServer[]
  rules?: SingboxDnsRule[]
  final?: string
  strategy?: 'prefer_ipv4' | 'ipv4_only' | 'prefer_ipv6' | 'ipv6_only'
  disable_cache?: boolean
  disable_expire?: boolean
  fakeip?: {
    enabled: boolean
    inet4_range?: string
    inet6_range?: string
  }
}

export interface SingboxRoute {
  rules: SingboxRouteRule[]
  final: string
  auto_detect_interface: boolean
  override_android_vpn?: boolean
}

export interface SingboxExperimental {
  clash_api?: {
    external_controller: string
    secret?: string
    store_selected?: boolean
    cache_file?: string
  }
}

export interface SingboxConfig {
  log: { level: string; timestamp: boolean }
  dns?: SingboxDnsConfig
  inbounds: SingboxInbound[]
  outbounds: SingboxOutbound[]
  route: SingboxRoute
  experimental?: SingboxExperimental
}

// Canonical engine-facing types for the platform-agnostic core.
//
// These were historically defined in apps/windows/src/shared/ipc/types.ts. As
// the unification proceeds (P0.2+), the Windows IPC types and the Android bridge
// types will both import these from @slave-vpn/core so the contract is shared.

import type { VPNStatus, VPNMode, TrafficStats } from '@slave-vpn/shared'

export type { VPNStatus, VPNMode, TrafficStats }

// ─── Proxies ────────────────────────────────────────────────────────────────
export interface ProxyEntry {
  name: string
  type: string // vless | vmess | trojan | ss | hysteria2 | tuic
  server: string
  port?: number
  transport?: string // tcp | ws | grpc | h2
  security?: string // reality | tls | none
  latencyMs?: number | null
  healthScore?: number
  countryCode?: string
  isFavorite?: boolean
  isAuto?: boolean // special: AUTO group entry
  group?: string // which group this belongs to
}

// ─── Active connections (mihomo /connections) ─────────────────────────────────
export interface ActiveConnection {
  id: string
  host: string
  network: string // tcp | udp
  type: string // HTTP / HTTPS / Socks5 / TUN
  destinationIP: string
  destinationPort: string
  sourceIP: string
  sourcePort: string
  process?: string
  chain: string
  rule: string
  upload: number
  download: number
  start: string // ISO timestamp
}

export interface ActiveConnectionsSnapshot {
  uploadTotal: number
  downloadTotal: number
  count: number
  connections: ActiveConnection[]
  fetchedAt: number
}

// ─── Connectivity diagnostics ─────────────────────────────────────────────────
export interface VPNConnectivityInfo {
  engineState: string
  processAlive: boolean
  apiResponding: boolean
  tunAvailable: boolean
  connectivityOk: boolean
  dnsOk: boolean
  trafficActive: boolean
  activeProxy: string | null
  proxyCount: number
  healthScore: number
  checkedAt: number
  captivePortal?: boolean
  quarantinedNodes?: number
  suggestion?: string
  realityStatus?: 'reality' | 'tls' | 'none'
  apiUrl?: string
}

// ─── Runtime events (engine → renderer) ───────────────────────────────────────
export type RuntimeEventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical'

export type RuntimeEventKind =
  | 'vpn.state_changed'
  | 'vpn.connected'
  | 'vpn.disconnected'
  | 'vpn.error'
  | 'vpn.preflight_warn'
  | 'vpn.preflight_failed'
  | 'health.degraded'
  | 'health.recovered'
  | 'health.dns_failure'
  | 'health.tunnel_unstable'
  | 'health.offline'
  | 'reconnect.attempt'
  | 'reconnect.success'
  | 'reconnect.exhausted'
  | 'sleep.suspend'
  | 'sleep.resume'
  | 'proxy.reality_error'
  | 'proxy.flow_error'
  | 'proxy.tls_error'
  | 'proxy.dns_error'
  | 'proxy.connection_refused'
  | 'proxy.timeout'
  | 'proxy.encryption_error'
  | 'proxy.selected'
  | 'connection.opened'
  | 'connection.closed'
  | 'rules.updated'

export interface RuntimeEvent {
  id: string
  kind: RuntimeEventKind
  severity: RuntimeEventSeverity
  timestamp: number
  message: string
  metadata?: Record<string, unknown>
}

export type Unsubscribe = () => void

export type VPNConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'reconnecting'
  | 'error'

export type VPNMode =
  | 'full'
  | 'bypass'
  | 'split'
  | 'custom'

export type VPNProtocol =
  | 'vless'
  | 'reality'
  | 'hysteria2'
  | 'tuic'
  | 'trojan'
  | 'shadowsocks'
  | 'unknown'

export interface VPNStatus {
  state: VPNConnectionState
  mode: VPNMode
  protocol: VPNProtocol | null
  serverName: string | null
  countryCode: string | null
  connectedAt: number | null
  lastError: string | null
}

export interface VPNError {
  code: VPNErrorCode
  message: string
  details?: string
  timestamp: number
}

export type VPNErrorCode =
  | 'ENGINE_START_FAILED'
  | 'ENGINE_CRASHED'
  | 'CONFIG_INVALID'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_FETCH_FAILED'
  | 'TUN_INIT_FAILED'
  | 'CONNECTION_TIMEOUT'
  | 'AUTH_REQUIRED'
  | 'NETWORK_UNAVAILABLE'
  | 'UNKNOWN'

export const INITIAL_VPN_STATUS: VPNStatus = {
  state: 'disconnected',
  mode: 'bypass',
  protocol: null,
  serverName: null,
  countryCode: null,
  connectedAt: null,
  lastError: null,
}

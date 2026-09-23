import type { EngineType } from './VPNEngine.interface'

export interface EngineCapabilities {
  tun: boolean
  reality: boolean
  sniffing: boolean
  hysteria2: boolean
  tuic: boolean
  wireguard: boolean
  hotReload: boolean
  probeLatency: boolean
}

const CAPABILITIES: Record<EngineType, EngineCapabilities> = {
  mihomo: {
    tun:          true,
    reality:      true,
    sniffing:     true,
    hysteria2:    true,
    tuic:         true,
    wireguard:    true,
    hotReload:    true,
    probeLatency: true,
  },
  singbox: {
    tun:          true,
    reality:      true,
    sniffing:     true,
    hysteria2:    true,
    tuic:         true,
    wireguard:    true,
    hotReload:    false,
    probeLatency: false,
  },
  xray: {
    tun:          false,
    reality:      true,
    sniffing:     true,
    hysteria2:    false,
    tuic:         false,
    wireguard:    false,
    hotReload:    false,
    probeLatency: false,
  },
}

export function getEngineCapabilities(type: EngineType): EngineCapabilities {
  return CAPABILITIES[type]
}

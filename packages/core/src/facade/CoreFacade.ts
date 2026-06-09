import type {
  VPNStatus,
  VPNMode,
  TrafficStats,
  ProxyEntry,
  ActiveConnectionsSnapshot,
  VPNConnectivityInfo,
  RuntimeEvent,
  Unsubscribe,
} from '../types.js'

/**
 * The single platform-agnostic API the renderer talks to.
 *
 * Shape intentionally mirrors the current `SlaveVPNBridge` so the renderer barely
 * changes. On Windows the facade runs in the main process behind IPC; on Android
 * it runs in the renderer over Capacitor adapters + the native engine. Methods
 * return plain values and THROW on error — each platform's transport wraps them
 * into the renderer's IpcResult contract.
 *
 * P0.1 ships the engine/VPN-centric surface (fully typed today). Subsequent
 * phases grow this interface as domain logic migrates into the core:
 *   P0.2 → subscriptions, settings
 *   P1   → routing
 *   P2   → dns
 *   P3   → rules
 *   P4   → geo, profiles
 */
export interface CoreVpnApi {
  connect(): Promise<void>
  disconnect(): Promise<void>
  getStatus(): Promise<VPNStatus>
  setMode(mode: VPNMode): Promise<void>
  getConnectivity(): Promise<VPNConnectivityInfo | null>
  setProxy(name: string): Promise<void>
  getProxyList(): Promise<ProxyEntry[]>
  getConnections(): Promise<ActiveConnectionsSnapshot | null>
  closeConnection(id: string): Promise<void>
  getTraffic(): Promise<TrafficStats>
  probeAll(): Promise<void>
}

export interface CoreEventsApi {
  onStatus(cb: (status: VPNStatus) => void): Unsubscribe
  onTraffic(cb: (traffic: TrafficStats) => void): Unsubscribe
  onRuntimeEvent(cb: (event: RuntimeEvent) => void): Unsubscribe
}

export interface CoreFacade {
  vpn: CoreVpnApi
  events: CoreEventsApi
  /** Cleanly tear down the core (stop engine, release listeners). */
  dispose(): Promise<void>
}

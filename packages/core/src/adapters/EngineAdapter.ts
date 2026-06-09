import type {
  VPNStatus,
  TrafficStats,
  ProxyEntry,
  ActiveConnectionsSnapshot,
  RuntimeEvent,
  Unsubscribe,
} from '../types.js'

/**
 * The actual proxy core (mihomo on BOTH platforms), abstracted.
 *
 * Windows backs this with the Node MihomoEngine (spawns mihomo.exe, talks to its
 * Clash API); Android with the native libbox/clashbox plugin via the Capacitor
 * bridge. The core hands the engine a ready-to-run config string and never knows
 * how the process is launched.
 *
 * `geositeCategories()` lets the core drop GEOSITE rules for categories absent
 * from the loaded geosite.dat (mihomo fatals otherwise) — unified across both
 * platforms instead of the Windows-only reader added in alpha.5.
 */
export interface EngineAdapter {
  /** Apply a fresh config and (re)start the tunnel. */
  start(config: string): Promise<void>
  stop(): Promise<void>
  /** Hot-reload a new config without a full restart, when the engine supports it. */
  reload?(config: string): Promise<void>

  getStatus(): Promise<VPNStatus>
  getTraffic(): Promise<TrafficStats>
  getProxies(): Promise<ProxyEntry[]>
  setProxy(name: string): Promise<void>
  getConnections(): Promise<ActiveConnectionsSnapshot | null>
  closeConnection(id: string): Promise<void>

  /** Measure a node's latency through the engine's delay test. */
  probeLatency(name: string, testUrl: string, timeoutMs: number): Promise<number | null>

  /** Lower-cased geosite categories present in the engine's loaded geosite.dat. */
  geositeCategories(): Promise<string[]>

  onEvent(handler: (event: RuntimeEvent) => void): Unsubscribe
}

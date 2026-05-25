import type { TrafficStats, VPNMode } from '@slave-vpn/shared'
import type { GeneratorSettings } from '@slave-vpn/config'
import type { DnsProfile } from '@slave-vpn/dns'
import type { NormalizedPolicy } from '@slave-vpn/routing'
import type { RuntimeState, HealthStatus, StopReason, HotReloadType } from '../state/RuntimeState'
import type { EngineEventName, EngineEventHandler, Unsubscribe } from './EngineEvents'

export type { GeneratorSettings }

export type EngineType = 'mihomo' | 'singbox' | 'xray'

export interface EngineInitConfig {
  binaryPath: string
  workingDir: string
  apiPort: number
  apiSecret: string
  tunHooks?: TunHooks
  // Path to the directory containing geo databases (geoip.dat / geosite.dat for
  // mihomo; geoip.db / geosite.db for sing-box). When unset, engines fall back
  // to working directory and may attempt to download on first use.
  rulesDir?: string
}

export interface ConnectionProfile {
  subscriptionYaml: string
  selectedProxy?: string
  vpnMode: VPNMode
  generatorSettings: GeneratorSettings
  dnsProfile?: DnsProfile
  routingPolicy?: NormalizedPolicy
}

export interface TunHooks {
  checkTunAvailability(): Promise<boolean>
  ensureTunDriver(): Promise<void>
}

export interface VPNEngine {
  readonly engineType: EngineType
  readonly engineVersion: string | null

  initialize(config: EngineInitConfig): Promise<void>
  start(profile: ConnectionProfile): Promise<void>
  stop(reason?: StopReason): Promise<void>
  restart(reason: StopReason): Promise<void>

  updateProfile(profile: ConnectionProfile): Promise<HotReloadType>

  // Returns RTT in ms via engine's delay API, or null if not running / unsupported.
  probeLatency?(tag: string, testUrl: string, timeoutMs: number): Promise<number | null>

  // Returns active connections snapshot if engine supports it; null otherwise.
  getConnections?(): Promise<import('../mihomo/MihomoApiClient').MihomoConnectionsInfo | null>

  // Closes a single active connection by id. No-op if unsupported.
  closeConnection?(id: string): Promise<void>

  getState(): RuntimeState
  getHealth(): HealthStatus
  getTraffic(): TrafficStats

  on<K extends EngineEventName>(event: K, handler: EngineEventHandler<K>): Unsubscribe

  dispose(): Promise<void>
}

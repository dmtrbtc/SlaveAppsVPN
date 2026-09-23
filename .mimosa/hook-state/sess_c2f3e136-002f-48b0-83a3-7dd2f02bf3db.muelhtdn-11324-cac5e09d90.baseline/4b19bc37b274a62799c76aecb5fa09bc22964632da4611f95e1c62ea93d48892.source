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
  // Optional per-file sources for mihomo geo databases. Windows resolves each
  // file independently so a partial auto-update overlay never hides the other
  // bundled database. When unset, MihomoEngine falls back to rulesDir.
  geoIpPath?: string
  geoSitePath?: string
  // Absolute paths to additional `geosite.dat` files (mihomo) whose categories
  // are merged into the single geosite.dat the engine loads — e.g. the RuNet
  // `geosite-runetfreedom.dat` carrying `ru-blocked`. Categories already present
  // in the base geosite.dat win; missing files are skipped silently.
  mergeGeoSiteDats?: readonly string[]
}

export interface ConnectionProfile {
  subscriptionYaml: string
  selectedProxy?: string
  vpnMode: VPNMode
  generatorSettings: GeneratorSettings
  dnsProfile?: DnsProfile
  routingPolicy?: NormalizedPolicy
  /**
   * uTLS fingerprint to apply to every TLS-enabled outbound. Default
   * `'randomized'` — rotates Client Hello each handshake so behavioural
   * DPI cannot match a stable signature. Engines forward this to their
   * ConfigGenerator/Compiler.
   */
  utlsFingerprint?: string
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

import type { TrafficStats, VPNMode } from '@slave-vpn/shared'
import type { GeneratorSettings } from '@slave-vpn/config'
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
}

export interface ConnectionProfile {
  subscriptionYaml: string
  selectedProxy?: string
  vpnMode: VPNMode
  generatorSettings: GeneratorSettings
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

  getState(): RuntimeState
  getHealth(): HealthStatus
  getTraffic(): TrafficStats

  on<K extends EngineEventName>(event: K, handler: EngineEventHandler<K>): Unsubscribe

  dispose(): Promise<void>
}

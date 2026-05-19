import { EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import type { TrafficStats } from '@slave-vpn/shared'
import type { VPNEngine, EngineInitConfig, ConnectionProfile } from './VPNEngine.interface'
import type { StopReason, HotReloadType, RuntimeState, HealthStatus } from '../state/RuntimeState'
import { EMPTY_HEALTH } from '../state/RuntimeState'
import type { EngineEventName, EngineEventHandler, Unsubscribe } from './EngineEvents'

export class SingboxEngine implements VPNEngine {
  readonly engineType = 'singbox' as const
  readonly engineVersion: string | null = null

  async initialize(_config: EngineInitConfig): Promise<void> {
    throw new Error('SingBox engine not yet implemented')
  }

  async start(_profile: ConnectionProfile): Promise<void> {
    throw new Error('SingBox engine not yet implemented')
  }

  async stop(_reason?: StopReason): Promise<void> {
    // no-op for stub
  }

  async restart(_reason: StopReason): Promise<void> {
    throw new Error('SingBox engine not yet implemented')
  }

  async updateProfile(_profile: ConnectionProfile): Promise<HotReloadType> {
    throw new Error('SingBox engine not yet implemented')
  }

  getState(): RuntimeState {
    return 'idle'
  }

  getHealth(): HealthStatus {
    return { ...EMPTY_HEALTH }
  }

  getTraffic(): TrafficStats {
    return { ...EMPTY_TRAFFIC_STATS }
  }

  on<K extends EngineEventName>(_event: K, _handler: EngineEventHandler<K>): Unsubscribe {
    return () => { /* noop */ }
  }

  async dispose(): Promise<void> {
    // no-op for stub
  }
}

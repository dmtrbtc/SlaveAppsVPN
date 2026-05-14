import { sleep, VPN, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import type { TrafficStats } from '@slave-vpn/shared'
import { createEngine } from './engine/EngineFactory'
import type { EngineType, EngineInitConfig, ConnectionProfile, VPNEngine } from './engine/VPNEngine.interface'
import type { EngineEventName, EngineEventHandler, Unsubscribe } from './engine/EngineEvents'
import { EMPTY_HEALTH, type RuntimeState, type HealthStatus, type StopReason, type HotReloadType } from './state/RuntimeState'

export class RuntimeManager {
  private engine: VPNEngine | null = null
  private currentProfile: ConnectionProfile | null = null
  private reconnectAttempts = 0
  private reconnectAborted = false
  private disposed = false

  async initialize(engineType: EngineType, config: EngineInitConfig): Promise<void> {
    if (this.engine) throw new Error('RuntimeManager already initialized')

    this.engine = createEngine(engineType)
    await this.engine.initialize(config)

    this.engine.on('stopped', ({ reason }) => {
      if (reason === 'crashed' && !this.disposed && !this.reconnectAborted) {
        void this.scheduleReconnect()
      }
    })
  }

  async connect(profile: ConnectionProfile): Promise<void> {
    this.requireEngine()
    this.reconnectAttempts = 0
    this.reconnectAborted = false
    this.currentProfile = profile
    await this.engine!.start(profile)
  }

  async disconnect(reason: StopReason = 'intentional'): Promise<void> {
    this.reconnectAborted = true
    this.reconnectAttempts = 0
    this.currentProfile = null
    await this.engine?.stop(reason)
  }

  async updateProfile(profile: ConnectionProfile): Promise<HotReloadType> {
    this.requireEngine()
    this.currentProfile = profile
    return this.engine!.updateProfile(profile)
  }

  getState(): RuntimeState {
    return this.engine?.getState() ?? 'idle'
  }

  getHealth(): HealthStatus {
    return this.engine?.getHealth() ?? { ...EMPTY_HEALTH }
  }

  getTraffic(): TrafficStats {
    return this.engine?.getTraffic() ?? { ...EMPTY_TRAFFIC_STATS }
  }

  getEngineVersion(): string | null {
    return this.engine?.engineVersion ?? null
  }

  on<K extends EngineEventName>(event: K, handler: EngineEventHandler<K>): Unsubscribe {
    this.requireEngine()
    return this.engine!.on(event, handler)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.reconnectAborted = true
    await this.engine?.dispose()
    this.engine = null
    this.currentProfile = null
  }

  private async scheduleReconnect(): Promise<void> {
    const maxAttempts = VPN.RECONNECT_ATTEMPTS

    if (this.reconnectAttempts >= maxAttempts) {
      // Exhausted reconnect budget; leave engine in current state.
      // User must manually reconnect.
      return
    }

    this.reconnectAttempts++
    const delayMs = Math.min(1_000 * Math.pow(2, this.reconnectAttempts - 1), 30_000)

    await sleep(delayMs)

    if (this.disposed || this.reconnectAborted || !this.currentProfile) return

    try {
      await this.engine!.restart('crashed')
      this.reconnectAttempts = 0
    } catch {
      if (!this.disposed && !this.reconnectAborted) {
        void this.scheduleReconnect()
      }
    }
  }

  private requireEngine(): void {
    if (!this.engine) throw new Error('RuntimeManager not initialized — call initialize() first')
  }
}

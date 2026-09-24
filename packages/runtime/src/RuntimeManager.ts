import { sleep, VPN, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import type { TrafficStats } from '@slave-vpn/shared'
import { createEngine } from './engine/EngineFactory'
import type { EngineType, EngineInitConfig, ConnectionProfile, VPNEngine } from './engine/VPNEngine.interface'
import type { EngineEventName, EngineEventHandler, Unsubscribe } from './engine/EngineEvents'
import { EMPTY_HEALTH, type RuntimeState, type HealthStatus, type StopReason, type HotReloadType } from './state/RuntimeState'
import { fingerprintConnectionProfile } from './profile/ConnectionProfileFingerprint'

type EngineFactory = (engineType: EngineType) => VPNEngine

export class RuntimeManager {
  private engine: VPNEngine | null = null
  private currentProfile: ConnectionProfile | null = null
  private reconnectAttempts = 0
  private reconnectAborted = false
  private disposed = false
  private appliedProfileHash: string | null = null
  private profileUpdateTail: Promise<void> = Promise.resolve()
  private lifecycleRevision = 0
  private connectionDesired = false

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.profileUpdateTail.then(action)
    this.profileUpdateTail = operation.then(() => undefined, () => undefined)
    return operation
  }

  constructor(
    private readonly engineFactory: EngineFactory = createEngine,
    private readonly options: { autoReconnect?: boolean } = {},
  ) {}

  isConnectionDesired(): boolean {
    return this.connectionDesired && !this.disposed
  }

  async initialize(engineType: EngineType, config: EngineInitConfig): Promise<void> {
    if (this.engine) throw new Error('RuntimeManager already initialized')

    this.engine = this.engineFactory(engineType)
    await this.engine.initialize(config)

    this.engine.on('stopped', ({ reason }) => {
      if (reason === 'crashed' && this.options.autoReconnect !== false && this.isConnectionDesired() && !this.reconnectAborted) {
        void this.scheduleReconnect()
      }
    })
  }

  async connect(profile: ConnectionProfile): Promise<void> {
    this.requireEngine()
    this.connectionDesired = true
    this.reconnectAttempts = 0
    this.reconnectAborted = false
    const revision = ++this.lifecycleRevision
    const snapshot = structuredClone(profile)
    await this.enqueue(async () => {
      if (revision !== this.lifecycleRevision || this.disposed) return
      if (this.engine!.getState() === 'crashed') await this.engine!.stop('crashed')
      if (revision !== this.lifecycleRevision || this.disposed) return
      await this.engine!.start(snapshot)
      this.currentProfile = snapshot
      this.appliedProfileHash = fingerprintConnectionProfile(snapshot)
    })
  }

  async disconnect(reason: StopReason = 'intentional'): Promise<void> {
    this.connectionDesired = false
    this.reconnectAborted = true
    this.reconnectAttempts = 0
    ++this.lifecycleRevision
    await this.enqueue(async () => {
      await this.engine?.stop(reason)
      this.currentProfile = null
      this.appliedProfileHash = null
    })
  }

  async updateProfile(profile: ConnectionProfile): Promise<HotReloadType> {
    this.requireEngine()
    const snapshot = structuredClone(profile)
    const nextHash = fingerprintConnectionProfile(snapshot)
    const revision = this.lifecycleRevision
    return this.enqueue(async () => {
      if (revision !== this.lifecycleRevision || this.disposed) return 'none' as const
      if (this.appliedProfileHash === nextHash) return 'none' as const
      const result = await this.engine!.updateProfile(snapshot)
      // Only advance the last-known-good profile after the engine accepted it.
      this.currentProfile = snapshot
      this.appliedProfileHash = nextHash
      return result
    })
  }

  getCurrentProfile(): ConnectionProfile | null {
    return this.currentProfile ? structuredClone(this.currentProfile) : null
  }

  getCurrentProfileHash(): string | null {
    return this.appliedProfileHash
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

  async probeLatency(tag: string, testUrl: string, timeoutMs: number): Promise<number | null> {
    return this.engine?.probeLatency?.(tag, testUrl, timeoutMs) ?? null
  }

  async getConnections(): Promise<import('./mihomo/MihomoApiClient').MihomoConnectionsInfo | null> {
    return this.engine?.getConnections?.() ?? null
  }

  async closeConnection(id: string): Promise<void> {
    await this.engine?.closeConnection?.(id)
  }

  on<K extends EngineEventName>(event: K, handler: EngineEventHandler<K>): Unsubscribe {
    this.requireEngine()
    return this.engine!.on(event, handler)
  }

  async dispose(): Promise<void> {
    this.connectionDesired = false
    this.disposed = true
    this.reconnectAborted = true
    ++this.lifecycleRevision
    await this.enqueue(async () => {
      await this.engine?.dispose()
      this.engine = null
      this.currentProfile = null
      this.appliedProfileHash = null
    })
  }

  private async scheduleReconnect(): Promise<void> {
    const revision = this.lifecycleRevision
    const maxAttempts = VPN.RECONNECT_ATTEMPTS

    if (this.reconnectAttempts >= maxAttempts) {
      // Exhausted reconnect budget; leave engine in current state.
      // User must manually reconnect.
      return
    }

    this.reconnectAttempts++
    const delayMs = Math.min(1_000 * Math.pow(2, this.reconnectAttempts - 1), 30_000)

    await sleep(delayMs)

    if (revision !== this.lifecycleRevision || this.disposed || this.reconnectAborted || !this.currentProfile) return

    try {
      await this.enqueue(async () => {
        if (revision !== this.lifecycleRevision || this.disposed || this.reconnectAborted) return
        await this.engine!.restart('crashed')
      })
      this.reconnectAttempts = 0
    } catch {
      if (revision === this.lifecycleRevision && !this.disposed && !this.reconnectAborted) {
        void this.scheduleReconnect()
      }
    }
  }

  private requireEngine(): void {
    if (!this.engine) throw new Error('RuntimeManager not initialized — call initialize() first')
  }
}

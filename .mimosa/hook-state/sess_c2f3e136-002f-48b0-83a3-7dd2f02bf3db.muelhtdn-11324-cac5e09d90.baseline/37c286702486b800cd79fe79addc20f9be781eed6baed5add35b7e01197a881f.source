import type { TrafficStats } from '@slave-vpn/shared'
import type { RuntimeState, HealthStatus, StopReason, HotReloadType } from '../state/RuntimeState'

export type EngineEventMap = {
  stateChanged: { state: RuntimeState; reason?: string }
  healthChanged: { health: HealthStatus }
  trafficUpdate: { stats: TrafficStats }
  error: { error: Error; fatal: boolean }
  stopped: { reason: StopReason; exitCode: number | null }
  logLine: { level: 'debug' | 'info' | 'warn' | 'error'; message: string }
  reloadCompleted: { type: HotReloadType }
}

export type EngineEventName = keyof EngineEventMap
export type EngineEventHandler<K extends EngineEventName> = (data: EngineEventMap[K]) => void
export type Unsubscribe = () => void

export class EngineEventBus {
  private readonly handlers = new Map<EngineEventName, Set<EngineEventHandler<EngineEventName>>>()

  on<K extends EngineEventName>(event: K, handler: EngineEventHandler<K>): Unsubscribe {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    const set = this.handlers.get(event)!
    set.add(handler as EngineEventHandler<EngineEventName>)
    return () => set.delete(handler as EngineEventHandler<EngineEventName>)
  }

  emit<K extends EngineEventName>(event: K, data: EngineEventMap[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const handler of set) {
      try {
        ;(handler as EngineEventHandler<K>)(data)
      } catch {
        /* event handlers must not crash the engine */
      }
    }
  }

  removeAll(): void {
    this.handlers.clear()
  }
}

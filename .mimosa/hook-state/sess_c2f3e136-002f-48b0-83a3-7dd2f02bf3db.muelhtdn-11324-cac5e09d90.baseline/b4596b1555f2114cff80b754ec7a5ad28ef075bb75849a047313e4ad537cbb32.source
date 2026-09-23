import type { CoreAdapters } from './adapters/index.js'
import type { CoreFacade } from './facade/CoreFacade.js'
import type { ServerLatencyResult, Unsubscribe, VPNMode } from './types.js'
import { CoreNotReadyError } from './errors.js'
import type { CoreConfigProvider } from './runtime/EngineConfigProvider.js'

/** Transitional platform mode sink while settings ownership moves into core. */
export interface CoreModeController {
  setMode(mode: VPNMode): Promise<void>
}

/** Platform endpoint passed to the shared latency-probe orchestration. */
export interface CoreProbeTarget {
  name: string
  server: string
  port: number
}

/**
 * Transitional platform boundary for disconnected node probes.
 *
 * Core owns batching, bounded concurrency, failure isolation and result events.
 * The platform only lists targets and measures one target without touching VPN
 * lifecycle state. Android implements the measurement with CapacitorHttp so the
 * probe remains available before the native engine is loaded.
 */
export interface CoreProbeProvider {
  listTargets(): Promise<CoreProbeTarget[]>
  probe(target: CoreProbeTarget): Promise<number | null>
  concurrency?: number
}

export interface CreateCoreOptions {
  configProvider?: CoreConfigProvider
  modeController?: CoreModeController
  probeProvider?: CoreProbeProvider
  /** Platform settle time between engine stop and config-based restart. */
  reconnectDelayMs?: number
}

/**
 * Build a CoreFacade from a set of platform adapters.
 *
 * Engine pass-throughs go straight to EngineAdapter. During the config-domain
 * migration, connect accepts a typed provider for a ready config and owns the
 * recovery → compile → start order. setMode uses a typed platform sink and
 * reuses connect when the engine is live. probeAll owns the shared batching and
 * result stream while the platform supplies a single-target latency probe.
 */
export function createCore(adapters: CoreAdapters, options: CreateCoreOptions = {}): CoreFacade {
  const { engine, logger } = adapters
  const subscriptions = new Set<Unsubscribe>()
  const serverLatencySubscribers = new Set<(result: ServerLatencyResult) => void>()
  let probeInFlight: Promise<void> | null = null

  const trackSubscription = (unsubscribe: Unsubscribe): Unsubscribe => {
    let active = true
    const tracked = () => {
      if (!active) return
      active = false
      subscriptions.delete(tracked)
      unsubscribe()
    }
    subscriptions.add(tracked)
    return tracked
  }

  const connect = async (): Promise<void> => {
    const configProvider = options.configProvider
    if (!configProvider) {
      throw new CoreNotReadyError('vpn.connect (config provider is not wired)')
    }
    logger?.debug('vpn.connect.start')
    try {
      if (await engine.restoreCached?.()) {
        logger?.info('vpn.connect.accepted')
        return
      }
      const compiled = await configProvider.compile()
      logger?.debug('vpn.config.compiled', {
        sizeBytes: new TextEncoder().encode(compiled.config).byteLength,
        warningCount: compiled.warnings?.length ?? 0,
      })
      for (const warning of compiled.warnings ?? []) {
        logger?.warn('vpn.config.warning', { warning })
      }
      await engine.start(compiled.config)
      logger?.info('vpn.connect.accepted')
    } catch (error) {
      logger?.error('vpn.connect.failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  const setMode = async (mode: VPNMode): Promise<void> => {
    const modeController = options.modeController
    if (!modeController) {
      throw new CoreNotReadyError('vpn.setMode (mode controller is not wired)')
    }
    await modeController.setMode(mode)
    const status = await engine.getStatus().catch(() => null)
    if (status?.state !== 'connected') return
    await engine.stop().catch(() => undefined)
    const reconnectDelayMs = options.reconnectDelayMs ?? 400
    if (reconnectDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, reconnectDelayMs))
    }
    await connect()
  }

  const emitServerLatency = (result: ServerLatencyResult): void => {
    for (const subscriber of serverLatencySubscribers) {
      try {
        subscriber(result)
      } catch (error) {
        logger?.warn('vpn.probeAll.subscriber_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  const runProbes = async (): Promise<void> => {
    const probeProvider = options.probeProvider
    if (!probeProvider) {
      throw new CoreNotReadyError('vpn.probeAll (probe provider is not wired)')
    }

    const targets = await probeProvider.listTargets()
    if (targets.length === 0) return

    const requestedConcurrency = Math.trunc(probeProvider.concurrency ?? 6)
    const concurrency = Math.min(targets.length,
      Number.isFinite(requestedConcurrency) ? Math.max(1, requestedConcurrency) : 6)
    let nextIndex = 0

    logger?.debug('vpn.probeAll.start', { targetCount: targets.length, concurrency })

    const worker = async (): Promise<void> => {
      while (nextIndex < targets.length) {
        const target = targets[nextIndex++]!
        let latencyMs: number | null = null
        try {
          latencyMs = await probeProvider.probe(target)
          if (latencyMs !== null && (!Number.isFinite(latencyMs) || latencyMs < 0)) {
            latencyMs = null
          }
        } catch (error) {
          logger?.warn('vpn.probeAll.target_failed', {
            proxyName: target.name,
            error: error instanceof Error ? error.message : String(error),
          })
        }
        emitServerLatency({
          proxyName: target.name,
          latencyMs,
          success: latencyMs !== null,
        })
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()))
    logger?.debug('vpn.probeAll.completed', { targetCount: targets.length })
  }

  // Dashboard and Servers may request a probe at the same time. Share the batch
  // so their combined requests retain the concurrency limit and one event/node.
  const probeAll = (): Promise<void> => {
    if (!probeInFlight) {
      probeInFlight = runProbes().finally(() => { probeInFlight = null })
    }
    return probeInFlight
  }

  return {
    vpn: {
      connect,
      disconnect: () => engine.stop(),
      getStatus: () => engine.getStatus(),
      setMode,
      getConnectivity: async () => null,
      setProxy: (name: string) => engine.setProxy(name),
      getProxyList: () => engine.getProxies(),
      getConnections: () => engine.getConnections(),
      closeConnection: (id: string) => engine.closeConnection(id),
      getTraffic: () => engine.getTraffic(),
      probeAll,
    },

    events: {
      onStatus: (cb) =>
        trackSubscription(engine.onEvent((e) => {
          if (e.kind === 'vpn.state_changed' || e.kind === 'vpn.connected' || e.kind === 'vpn.disconnected') {
            void engine.getStatus().then(cb).catch(() => undefined)
          }
        })),
      onTraffic: (cb) => {
        // Traffic is polled by platforms today; a dedicated engine traffic event
        // stream is wired in P0.3. For now this is a no-op subscription.
        void cb
        return () => undefined
      },
      onRuntimeEvent: (cb) => trackSubscription(engine.onEvent(cb)),
      onServerLatency: (cb) => {
        // Each registration has its own lifetime even when a callback is reused.
        const subscriber = (result: ServerLatencyResult) => cb(result)
        serverLatencySubscribers.add(subscriber)
        return trackSubscription(() => { serverLatencySubscribers.delete(subscriber) })
      },
    },

    dispose: async () => {
      for (const unsubscribe of [...subscriptions]) unsubscribe()
      await engine.stop().catch(() => undefined)
    },
  }
}

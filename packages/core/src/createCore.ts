import type { CoreAdapters } from './adapters/index.js'
import type { CoreFacade } from './facade/CoreFacade.js'
import type { Unsubscribe, VPNMode } from './types.js'
import { CoreNotReadyError } from './errors.js'

/** Transitional source of an already compiled engine config.
 *
 * Android supplies a thin platform data provider which invokes the shared core
 * compiler. Once CoreFacade owns those data-source APIs directly, this
 * compatibility option can be removed.
 */
export interface CoreConfigProvider {
  compile(): Promise<string>
}

/** Transitional platform mode sink while settings ownership moves into core. */
export interface CoreModeController {
  setMode(mode: VPNMode): Promise<void>
}

export interface CreateCoreOptions {
  configProvider?: CoreConfigProvider
  modeController?: CoreModeController
  /** Platform settle time between engine stop and config-based restart. */
  reconnectDelayMs?: number
}

/**
 * Build a CoreFacade from a set of platform adapters.
 *
 * Engine pass-throughs go straight to EngineAdapter. During the config-domain
 * migration, connect accepts a typed provider for a ready config and owns the
 * recovery → compile → start order. setMode uses a typed platform sink and
 * reuses connect when the engine is live. probeAll remains an explicit
 * CoreNotReadyError stub until its policy moves into core.
 */
export function createCore(adapters: CoreAdapters, options: CreateCoreOptions = {}): CoreFacade {
  const { engine, logger } = adapters
  const subscriptions = new Set<Unsubscribe>()

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
      const config = await configProvider.compile()
      await engine.start(config)
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
      probeAll: () => {
        throw new CoreNotReadyError('vpn.probeAll (balancer policy lands in P4)')
      },
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
    },

    dispose: async () => {
      for (const unsubscribe of [...subscriptions]) unsubscribe()
      await engine.stop().catch(() => undefined)
    },
  }
}

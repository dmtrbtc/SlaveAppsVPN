import type { CoreAdapters } from './adapters/index.js'
import type { CoreFacade } from './facade/CoreFacade.js'
import type { Unsubscribe } from './types.js'
import { CoreNotReadyError } from './errors.js'

/** Transitional source of an already compiled engine config.
 *
 * Android supplies its legacy compiler through this boundary while config
 * assembly moves into core. Once both platforms build from the shared domain
 * inputs directly, this compatibility option can be removed.
 */
export interface CoreConfigProvider {
  compile(): Promise<string>
}

export interface CreateCoreOptions {
  configProvider?: CoreConfigProvider
}

/**
 * Build a CoreFacade from a set of platform adapters.
 *
 * Engine pass-throughs go straight to EngineAdapter. During the config-domain
 * migration, connect accepts a typed provider for a ready config and owns the
 * recovery → compile → start order. setMode/probeAll remain explicit
 * CoreNotReadyError stubs until their domain policies move into core.
 */
export function createCore(adapters: CoreAdapters, options: CreateCoreOptions = {}): CoreFacade {
  const { engine } = adapters
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

  return {
    vpn: {
      connect: async () => {
        const configProvider = options.configProvider
        if (!configProvider) {
          throw new CoreNotReadyError('vpn.connect (config provider is not wired)')
        }
        if (await engine.restoreCached?.()) return
        const config = await configProvider.compile()
        await engine.start(config)
      },
      disconnect: () => engine.stop(),
      getStatus: () => engine.getStatus(),
      setMode: () => {
        throw new CoreNotReadyError('vpn.setMode (mode→routing wiring lands in P1)')
      },
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

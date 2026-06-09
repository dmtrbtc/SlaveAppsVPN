import type { CoreAdapters } from './adapters/index.js'
import type { CoreFacade } from './facade/CoreFacade.js'
import { CoreNotReadyError } from './errors.js'

/**
 * Build a CoreFacade from a set of platform adapters.
 *
 * P0.1 wires the trivial engine pass-throughs (status / traffic / proxies /
 * connections / events) straight to the EngineAdapter. The orchestrated methods
 * (connect/disconnect/probeAll, which need subscription→config compilation) are
 * stubbed with CoreNotReadyError until the domain logic migrates in P0.2+. This
 * keeps the package real and compiling while both platforms are still on their
 * legacy paths — nothing wires `createCore` into an app yet.
 */
export function createCore(adapters: CoreAdapters): CoreFacade {
  const { engine } = adapters

  return {
    vpn: {
      connect: () => {
        throw new CoreNotReadyError('vpn.connect (config orchestration lands in P0.2)')
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
        engine.onEvent((e) => {
          if (e.kind === 'vpn.state_changed' || e.kind === 'vpn.connected' || e.kind === 'vpn.disconnected') {
            void engine.getStatus().then(cb)
          }
        }),
      onTraffic: (cb) => {
        // Traffic is polled by platforms today; a dedicated engine traffic event
        // stream is wired in P0.3. For now this is a no-op subscription.
        void cb
        return () => undefined
      },
      onRuntimeEvent: (cb) => engine.onEvent(cb),
    },

    dispose: async () => {
      await engine.stop().catch(() => undefined)
    },
  }
}

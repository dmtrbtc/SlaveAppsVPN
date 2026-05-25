/**
 * Bridge shim — exposes a `window.slaveVPN` object on Android that mirrors
 * the Electron preload bridge.
 *
 * The Windows renderer reads `window.slaveVPN.{vpn,subscriptions,...}.method()`
 * and expects every call to return a discriminated `IpcResult<T>` envelope.
 * Capacitor plugins instead resolve/reject promises directly. This file is
 * the translation layer.
 *
 * Wiring: import this once at app entry (e.g. in main.tsx wrapper) before
 * the React tree mounts. After import, the renderer code is identical
 * across Windows + Android.
 *
 * NOTE: only methods the Android plugin actually implements get wired up.
 * Everything else either returns a stub-ok or throws "not implemented" —
 * UI screens that depend on those should hide themselves on Android via
 * a feature-detect (e.g. `if (!window.slaveVPN.tray) {...}`).
 */
import { SlaveVpn } from '../plugin/SlaveVpnPlugin'
import { INITIAL_VPN_STATUS, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'

type IpcOk<T> = { ok: true; data: T }
type IpcErr = { ok: false; error: { code: string; message: string } }
type IpcResult<T> = IpcOk<T> | IpcErr

function ok<T>(data: T): IpcOk<T> { return { ok: true, data } }
function err(code: string, message: string): IpcErr { return { ok: false, error: { code, message } } }

async function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return ok(await fn())
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return err('ANDROID_PLUGIN_ERROR', message)
  }
}

// Best-effort fallback noop for IPC methods not yet implemented on Android.
function notImplemented(name: string): () => Promise<IpcErr> {
  return async () => err('NOT_IMPLEMENTED', `${name} not implemented on Android`)
}

export function installAndroidBridge(): void {
  if (typeof window === 'undefined') return
  if ((window as unknown as { slaveVPN?: unknown }).slaveVPN) return

  const bridge = {
    vpn: {
      connect: () => wrap(() => SlaveVpn.connect()),
      disconnect: () => wrap(() => SlaveVpn.disconnect()),
      getStatus: () => wrap(async () => {
        const r = await SlaveVpn.getStatus().catch(() => ({ status: INITIAL_VPN_STATUS }))
        return r.status
      }),
      setMode: (payload: { mode: import('@slave-vpn/shared').VPNMode }) =>
        wrap(() => SlaveVpn.setMode(payload)),
      // Stubs for Windows-only features
      getConnectivity: notImplemented('vpn.getConnectivity'),
      setProxy: notImplemented('vpn.setProxy'),
      getProxyList: async () => ok([]),
      getConnections: async () => ok(null),
      closeConnection: notImplemented('vpn.closeConnection'),
      getBalancerState: notImplemented('vpn.getBalancerState'),
      setBalancerEnabled: notImplemented('vpn.setBalancerEnabled'),
      setBalancerMode: notImplemented('vpn.setBalancerMode'),
      probeAll: notImplemented('vpn.probeAll'),
    },

    subscriptions: {
      list: () => wrap(async () => (await SlaveVpn.listSubscriptions()).entries),
      add: (payload: { type: 'subscription-url' | 'single-proxy' | 'remnawave-key' | 'provider'; input: string; name?: string }) =>
        wrap(async () => (await SlaveVpn.addSubscription({
          type: payload.type,
          input: payload.input,
          ...(payload.name ? { name: payload.name } : {}),
        })).entry),
      remove: (payload: { id: string }) => wrap(() => SlaveVpn.removeSubscription(payload)),
      update: notImplemented('subscriptions.update'),
      refresh: (payload: { id: string }) => wrap(async () => (await SlaveVpn.refreshSubscription(payload)).entry),
      refreshAll: notImplemented('subscriptions.refreshAll'),
      detectClipboard: async () => ok({ found: false }),
    },

    diagnostics: {
      collect: notImplemented('diagnostics.collect'),
      exportLogs: notImplemented('diagnostics.exportLogs'),
      getLogs: () => wrap(async () => {
        const { lines } = await SlaveVpn.getLogs({ tail: 500 })
        return lines.map(l => ({ level: 'info', time: Date.now(), msg: l }))
      }),
      getStartup: async () => ok({ phases: [], totalMs: 0, appStartedAt: Date.now(), completedAt: Date.now() }),
      selfTest: notImplemented('diagnostics.selfTest'),
    },

    events: {
      onVpnStatus: (cb: (s: import('@slave-vpn/shared').VPNStatus) => void) => {
        const promise = SlaveVpn.addListener('statusChanged', cb)
        return () => { void promise.then(h => h.remove()) }
      },
      onVpnTraffic: (cb: (s: import('@slave-vpn/shared').TrafficStats) => void) => {
        const promise = SlaveVpn.addListener('trafficUpdate', cb)
        return () => { void promise.then(h => h.remove()) }
      },
      // Windows-only — stub
      onVpnError: () => () => undefined,
      onVpnHealth: () => () => undefined,
      onRuntimeEvent: () => () => undefined,
      onSubscriptionUpdated: () => () => undefined,
      onAuthExpired: () => () => undefined,
      onUpdateAvailable: () => () => undefined,
      onUpdateDownloaded: () => () => undefined,
      onUpdateProgress: () => () => undefined,
      onNotification: () => () => undefined,
      onServerLatency: () => () => undefined,
      onBalancerState: () => () => undefined,
      onProxyChanged: () => () => undefined,
      onSubscriptionsChanged: () => () => undefined,
      onProfilesChanged: () => () => undefined,
    },

    // Stubs for everything not yet ported (UI hides these features on Android)
    auth: {
      loginEmail: notImplemented('auth.loginEmail'),
      loginTelegram: notImplemented('auth.loginTelegram'),
      logout: async () => ok(undefined),
      getMe: notImplemented('auth.getMe'),
      refresh: notImplemented('auth.refresh'),
    },
    controls: {
      minimize: async () => undefined,
      maximize: async () => undefined,
      close: async () => undefined,
    },
  } as const

  // Bypass strict typing — at runtime this matches the Windows bridge shape.
  ;(window as unknown as { slaveVPN: typeof bridge }).slaveVPN = bridge

  // Bootstrap traffic stats — emit zero initially so the sparkline doesn't NaN
  void SlaveVpn.getTraffic().catch(() => ({ traffic: EMPTY_TRAFFIC_STATS }))
}

// Auto-install when imported
installAndroidBridge()

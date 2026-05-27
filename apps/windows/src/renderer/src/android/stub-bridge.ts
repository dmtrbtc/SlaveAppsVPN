/**
 * Fallback bridge installed when the real Capacitor bridge module fails to
 * load (e.g. import chunk fetch failed, @capacitor/* threw at module init,
 * etc.). Surfaces the install error via every method instead of leaving
 * window.slaveVPN undefined and getting the generic "preload not
 * initialized" message that gives no hint about what went wrong.
 */
import { INITIAL_VPN_STATUS, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'

type IpcErr = { ok: false; error: { code: string; message: string } }
type IpcOk<T> = { ok: true; data: T }

function err(message: string): IpcErr {
  return { ok: false, error: { code: 'ANDROID_BRIDGE_INSTALL_FAILED', message } }
}
function ok<T>(data: T): IpcOk<T> { return { ok: true, data } }

export function installStubBridge(reason: string): void {
  if (typeof window === 'undefined') return
  const message = `Android bridge failed to install: ${reason}`
  const allError = async (): Promise<IpcErr> => err(message)
  const allErrorWithName = (name: string) => async (): Promise<IpcErr> => err(`${name}: ${message}`)

  const stub = {
    vpn: {
      connect: allErrorWithName('vpn.connect'),
      disconnect: allErrorWithName('vpn.disconnect'),
      getStatus: async () => ok(INITIAL_VPN_STATUS),
      setMode: allErrorWithName('vpn.setMode'),
      getConnectivity: allError,
      setProxy: allErrorWithName('vpn.setProxy'),
      getProxyList: async () => ok([] as never[]),
      getConnections: async () => ok(null),
      closeConnection: allError,
      getBalancerState: allError,
      setBalancerEnabled: allError,
      setBalancerMode: allError,
      probeAll: allError,
    },
    subscriptions: {
      list: async () => ok([] as never[]),
      add: allErrorWithName('subscriptions.add'),
      remove: allErrorWithName('subscriptions.remove'),
      update: allErrorWithName('subscriptions.update'),
      refresh: allErrorWithName('subscriptions.refresh'),
      refreshAll: allError,
      detectClipboard: async () => ok({ found: false }),
    },
    diagnostics: {
      collect: allError,
      exportLogs: allError,
      getLogs: async () => ok([{ level: 'error', time: Date.now(), msg: message }]),
      getStartup: async () => ok({ phases: [], totalMs: 0, appStartedAt: Date.now(), completedAt: Date.now() }),
      selfTest: allError,
    },
    configSource: {
      getMeta: async () => ok(null),
      set: allErrorWithName('configSource.set'),
      validate: allErrorWithName('configSource.validate'),
      clear: async () => ok(undefined),
    },
    settings: { get: async () => ok({}), set: async () => ok(undefined) },
    provider: { getManifest: allError, getCapabilities: allError },
    servers: { list: async () => ok([] as never[]), probe: async () => ok(undefined) },
    safeMode: { getStatus: async () => ok({ inSafeMode: false }), reset: async () => ok(undefined) },
    update: {
      check: async () => ok({ available: false }),
      download: allError,
      install: allError,
      getStatus: async () => ok({ state: 'idle' }),
      setChannel: allError,
    },
    runtime: { restart: allError },
    cache: { clear: async () => ok(undefined) },
    dns: {
      getProfile: async () => ok(null),
      setProfile: allError,
      getPresets: async () => ok([] as never[]),
      getStrategies: async () => ok([] as never[]),
      leakTest: allError,
    },
    rules: {
      list: async () => ok([] as never[]),
      add: allError, remove: allError, update: allError, reorder: allError,
      reload: async () => ok(undefined),
    },
    split: {
      getProcesses: async () => ok([] as never[]),
      getProcessList: async () => ok([] as never[]),
      setProcessList: async () => ok(undefined),
    },
    routing: {
      listScenarios: async () => ok({ available: [], enabled: [] }),
      setEnabledScenarios: async () => ok(undefined),
    },
    profiles: {
      list: async () => ok({ profiles: [], activeProfileId: null }),
      saveCurrent: allError, remove: allError, apply: allError,
    },
    geo: {
      getState: async () => ok({ assets: [], lastUpdateAt: 0 }),
      updateAll: allError, updateOne: allError,
      listSources: async () => ok([] as never[]),
    },
    events: {
      onVpnStatus: () => () => undefined,
      onVpnTraffic: () => () => undefined,
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
      onGeoUpdaterState: () => () => undefined,
    },
    auth: {
      loginEmail: allError,
      loginTelegram: allError,
      logout: async () => ok(undefined),
      getMe: allError,
      refresh: allError,
    },
    controls: {
      minimize: async () => undefined,
      maximize: async () => undefined,
      close: async () => undefined,
    },
  } as const

  ;(window as unknown as { slaveVPN: typeof stub }).slaveVPN = stub
  void EMPTY_TRAFFIC_STATS
}

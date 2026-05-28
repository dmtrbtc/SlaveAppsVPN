import { registerPlugin } from '@capacitor/core'
import type { VPNMode, VPNStatus, TrafficStats } from '@slave-vpn/shared'
import { INITIAL_VPN_STATUS, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import {
  listSubscriptions,
  addSubscription,
  removeSubscription,
  getSubscriptionInput,
  updateSubscriptionMeta,
  type AndroidSubscriptionEntry,
  type AndroidSubscriptionType,
} from './subscription-store'
import { buildAggregatedYaml } from './aggregator'
import { compileSingboxConfigForAndroid } from './compile-config'
import { detectClipboardLink } from './clipboard-detect'

// ─── Native plugin interface ──────────────────────────────────────────────────

interface NativeSlaveVpn {
  checkPermission(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  connect(options: { config: string; subscriptionId?: string; selectedProxy?: string; vpnMode?: VPNMode }): Promise<void>
  disconnect(): Promise<void>
  getStatus(): Promise<{ status: VPNStatus }>
  getTraffic(): Promise<{ traffic: TrafficStats }>
  setMode(options: { mode: VPNMode }): Promise<void>
  getLogs(options?: { tail?: number }): Promise<{ lines: string[] }>
  setEngine(options: { engine: 'mihomo' | 'singbox' }): Promise<void>
  addListener(
    eventName: 'statusChanged',
    listener: (status: VPNStatus) => void,
  ): Promise<{ remove: () => Promise<void> }>
  addListener(
    eventName: 'trafficUpdate',
    listener: (stats: TrafficStats) => void,
  ): Promise<{ remove: () => Promise<void> }>
  removeAllListeners(): Promise<void>
}

const SlaveVpn = registerPlugin<NativeSlaveVpn>('SlaveVpn')

// ─── IPC envelope helpers ─────────────────────────────────────────────────────

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
    return err('ANDROID_BRIDGE_ERROR', message)
  }
}

function notImplemented(name: string): () => Promise<IpcErr> {
  return async () => err('NOT_IMPLEMENTED', `${name} not implemented on Android`)
}

// ─── Subscription entry mapping ───────────────────────────────────────────────

function toIpcEntry(e: AndroidSubscriptionEntry): AndroidSubscriptionEntry {
  // Structurally compatible with Windows SubscriptionEntry — same field set.
  return e
}

// ─── Currently-selected proxy & mode (persisted in memory) ───────────────────

let currentMode: VPNMode = 'bypass'
let currentSelectedProxy: string | undefined
let currentUtlsFingerprint: string = 'randomized'

const UTLS_LS_KEY = 'slave.settings.utlsFingerprint.v1'

function loadUtlsFromLocalStorage(): void {
  try {
    const v = window.localStorage.getItem(UTLS_LS_KEY)
    if (v) currentUtlsFingerprint = v
  } catch { /* swallow */ }
}

function saveUtlsToLocalStorage(value: string): void {
  try { window.localStorage.setItem(UTLS_LS_KEY, value) } catch { /* swallow */ }
}

// ─── Install ──────────────────────────────────────────────────────────────────

let installed = false

export function installAndroidBridge(): void {
  if (installed) return
  installed = true
  if (typeof window === 'undefined') return

  const bridge = {
    vpn: {
      connect: () => wrap(async () => {
        // Make sure we have VPN permission before doing the heavy lifting.
        const perm = await SlaveVpn.checkPermission().catch(() => ({ granted: false }))
        if (!perm.granted) {
          const requested = await SlaveVpn.requestPermission().catch(() => ({ granted: false }))
          if (!requested.granted) throw new Error('Android VPN permission denied')
        }
        const compiled = await compileSingboxConfigForAndroid({
          vpnMode: currentMode,
          ...(currentSelectedProxy ? { selectedProxy: currentSelectedProxy } : {}),
          utlsFingerprint: currentUtlsFingerprint,
        })
        await SlaveVpn.connect({
          config: compiled.json,
          ...(currentSelectedProxy ? { selectedProxy: currentSelectedProxy } : {}),
          vpnMode: currentMode,
        })
      }),
      disconnect: () => wrap(() => SlaveVpn.disconnect()),
      getStatus: () => wrap(async () => {
        try {
          const { status } = await SlaveVpn.getStatus()
          return status
        } catch {
          return INITIAL_VPN_STATUS
        }
      }),
      setMode: (payload: { mode: VPNMode }) => wrap(async () => {
        currentMode = payload.mode
        await SlaveVpn.setMode(payload).catch(() => undefined)
      }),
      getConnectivity: notImplemented('vpn.getConnectivity'),
      setProxy: (payload: { proxy: string }) => wrap(async () => {
        currentSelectedProxy = payload.proxy
      }),
      getProxyList: async () => ok([] as never[]),
      getConnections: async () => ok(null),
      closeConnection: notImplemented('vpn.closeConnection'),
      getBalancerState: notImplemented('vpn.getBalancerState'),
      setBalancerEnabled: notImplemented('vpn.setBalancerEnabled'),
      setBalancerMode: notImplemented('vpn.setBalancerMode'),
      probeAll: notImplemented('vpn.probeAll'),
    },

    subscriptions: {
      list: () => wrap(async () => (await listSubscriptions()).map(toIpcEntry)),
      add: (payload: { type: AndroidSubscriptionType; input: string; name?: string }) =>
        wrap(async () => toIpcEntry(await addSubscription({
          type: payload.type,
          input: payload.input,
          ...(payload.name ? { name: payload.name } : {}),
        }))),
      remove: (payload: { id: string }) => wrap(() => removeSubscription(payload.id)),
      update: (payload: { id: string; name?: string; enabled?: boolean; autoUpdateMinutes?: AndroidSubscriptionEntry['autoUpdateMinutes'] }) => wrap(async () => {
        const patch: Partial<AndroidSubscriptionEntry> = {}
        if (typeof payload.name === 'string') patch.name = payload.name
        if (typeof payload.enabled === 'boolean') patch.enabled = payload.enabled
        if (typeof payload.autoUpdateMinutes === 'number') patch.autoUpdateMinutes = payload.autoUpdateMinutes
        const updated = await updateSubscriptionMeta(payload.id, patch)
        if (!updated) throw new Error('Subscription not found')
        return toIpcEntry(updated)
      }),
      refresh: (payload: { id: string }) => wrap(async () => {
        // Refresh = re-run the aggregator (cheap on one entry); easier than
        // adding a per-entry fetch path right now.
        await buildAggregatedYaml().catch(() => undefined)
        const list = await listSubscriptions()
        const entry = list.find(e => e.id === payload.id)
        if (!entry) throw new Error('Subscription not found')
        return toIpcEntry(entry)
      }),
      refreshAll: () => wrap(async () => {
        await buildAggregatedYaml().catch(() => undefined)
        return (await listSubscriptions()).map(toIpcEntry)
      }),
      detectClipboard: () => wrap(() => detectClipboardLink()),
    },

    diagnostics: {
      collect: notImplemented('diagnostics.collect'),
      exportLogs: notImplemented('diagnostics.exportLogs'),
      getLogs: () => wrap(async () => {
        try {
          const { lines } = await SlaveVpn.getLogs({ tail: 500 })
          return lines.map(l => ({ level: 'info', time: Date.now(), msg: l }))
        } catch {
          return []
        }
      }),
      getStartup: async () => ok({ phases: [], totalMs: 0, appStartedAt: Date.now(), completedAt: Date.now() }),
      selfTest: notImplemented('diagnostics.selfTest'),
    },

    events: {
      onVpnStatus: (cb: (s: VPNStatus) => void) => {
        const promise = SlaveVpn.addListener('statusChanged', cb)
        return () => { void promise.then(h => h.remove()).catch(() => undefined) }
      },
      onVpnTraffic: (cb: (s: TrafficStats) => void) => {
        const promise = SlaveVpn.addListener('trafficUpdate', cb)
        return () => { void promise.then(h => h.remove()).catch(() => undefined) }
      },
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

    // ─── configSource — validate is real, rest are no-ops ─────────────────────
    // SettingsPage / Onboarding call validate({type, input}) to preview a URL
    // before saving. We fetch, normalize, and count proxies.
    configSource: {
      getMeta: async () => ok(null),
      set: async () => ok({ type: 'subscription-url' as const, summary: 'Android: managed via Подписки tab' }),
      validate: (payload: { type: AndroidSubscriptionType; input: string }) => wrap(async () => {
        const { input } = payload
        if (!input || !input.trim()) {
          return { valid: false, error: 'Empty input' }
        }
        if (payload.type === 'subscription-url') {
          try {
            const { fetchSubscriptionPreview } = await import('./validate')
            return await fetchSubscriptionPreview(input.trim())
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return { valid: false, error: message }
          }
        }
        // Other types accepted as-is on Android (single-proxy parses via add())
        return { valid: true, displayName: payload.type }
      }),
      clear: async () => ok(undefined),
    },

    settings: {
      get: async () => ok({
        vpnMode: currentMode,
        utlsFingerprint: currentUtlsFingerprint,
      } as never),
      set: (payload: Record<string, unknown>) => wrap(async () => {
        if (typeof payload['vpnMode'] === 'string') {
          const m = payload['vpnMode'] as VPNMode
          if (m === 'full' || m === 'bypass' || m === 'split' || m === 'custom') {
            currentMode = m
          }
        }
        if (typeof payload['utlsFingerprint'] === 'string') {
          currentUtlsFingerprint = payload['utlsFingerprint'] as string
          saveUtlsToLocalStorage(currentUtlsFingerprint)
        }
      }),
    },
    provider: {
      getManifest: notImplemented('provider.getManifest'),
      getCapabilities: notImplemented('provider.getCapabilities'),
    },
    servers: {
      list: async () => ok([] as never[]),
      probe: async () => ok(undefined),
    },
    safeMode: {
      getStatus: async () => ok({ inSafeMode: false } as never),
      reset: async () => ok(undefined),
    },
    update: {
      check: async () => ok({ available: false } as never),
      download: notImplemented('update.download'),
      install: notImplemented('update.install'),
      getStatus: async () => ok({ state: 'idle' } as never),
      setChannel: notImplemented('update.setChannel'),
    },
    runtime: {
      restart: notImplemented('runtime.restart'),
    },
    cache: {
      clear: async () => ok(undefined),
    },
    dns: {
      getProfile: async () => ok(null as never),
      setProfile: notImplemented('dns.setProfile'),
      getPresets: async () => ok([] as never[]),
      getStrategies: async () => ok([] as never[]),
      leakTest: notImplemented('dns.leakTest'),
    },
    rules: {
      list: async () => ok([] as never[]),
      add: notImplemented('rules.add'),
      remove: notImplemented('rules.remove'),
      update: notImplemented('rules.update'),
      reorder: notImplemented('rules.reorder'),
      reload: async () => ok(undefined),
    },
    split: {
      getProcesses: async () => ok([] as never[]),
      getProcessList: async () => ok([] as never[]),
      setProcessList: async () => ok(undefined),
    },
    routing: {
      listScenarios: async () => ok({ available: [], enabled: [] } as never),
      setEnabledScenarios: async () => ok(undefined),
    },
    profiles: {
      list: async () => ok({ profiles: [], activeProfileId: null } as never),
      saveCurrent: notImplemented('profiles.saveCurrent'),
      remove: notImplemented('profiles.remove'),
      apply: notImplemented('profiles.apply'),
    },
    geo: {
      getState: async () => ok({ assets: [], lastUpdateAt: 0 } as never),
      updateAll: notImplemented('geo.updateAll'),
      updateOne: notImplemented('geo.updateOne'),
      listSources: async () => ok([] as never[]),
    },

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

  // Match Windows bridge shape at runtime (types differ deliberately —
  // Android subset; renderer hides unsupported screens via feature detection).
  ;(window as unknown as { slaveVPN: typeof bridge }).slaveVPN = bridge

  // Restore persisted uTLS fingerprint preference.
  loadUtlsFromLocalStorage()

  // Best-effort initial traffic ping so the sparkline doesn't NaN.
  void SlaveVpn.getTraffic().catch(() => ({ traffic: EMPTY_TRAFFIC_STATS }))

  // Seed currentMode from local cache if user set one previously
  void getSubscriptionInput('__pref_vpn_mode__').then(v => {
    if (v === 'full' || v === 'bypass' || v === 'split' || v === 'custom') currentMode = v
  })
}

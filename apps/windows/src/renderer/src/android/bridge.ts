import { registerPlugin } from '@capacitor/core'
import type { VPNMode, VPNStatus, TrafficStats, Server } from '@slave-vpn/shared'
import type { VpnSetProxyPayload } from '@shared/ipc/types'
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
import { listAndroidServers, invalidateServerCache } from './servers'
import { compileMihomoConfigForAndroid } from './compile-config'
import { detectClipboardLink } from './clipboard-detect'

// ─── Native plugin interface ──────────────────────────────────────────────────

interface NativeSlaveVpn {
  checkPermission(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  connect(options: { config: string; subscriptionId?: string; selectedProxy?: string; vpnMode?: VPNMode }): Promise<void>
  disconnect(): Promise<void>
  getStatus(): Promise<{ status: { state?: string; mode?: string; protocol?: string; lastError?: string | null; activeProxy?: string | null } }>
  getTraffic(): Promise<{ traffic: TrafficStats }>
  getConnections(): Promise<{ snapshot: string }>
  testDelay(options: { name: string; url?: string; timeout?: number }): Promise<{ delay: number }>
  setMode(options: { mode: VPNMode }): Promise<void>
  selectProxy(options: { name: string }): Promise<void>
  appendLog(options: { line: string }): Promise<void>
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

// Mirror of @shared/ipc/types ConfigSourceMeta (the renderer unwrap() expects
// this exact shape; declared locally to keep the bridge dependency-light).
type ConfigSourceMetaShape = {
  type: AndroidSubscriptionType
  displayName: string
  urlDomain?: string
  proxyProtocol?: string
  addedAt: number
}

function ok<T>(data: T): IpcOk<T> { return { ok: true, data } }
function err(code: string, message: string): IpcErr { return { ok: false, error: { code, message } } }

// Push a diagnostic line into the native in-app Logs ring buffer
// (Диагностика→Логи), so the renderer half of the chain is observable on device.
function nativeLog(msg: string): void {
  void SlaveVpn.appendLog({ line: msg }).catch(() => undefined)
}

// Map an aggregated Server → the IPC ProxyEntry shape the renderer's proxy list
// expects (name/type/countryCode/latencyMs are what the UI renders).
function toProxyEntry(s: Server): {
  name: string; type: string; server: string; latencyMs: number | null
  countryCode?: string; transport?: string; security?: string
} {
  return {
    name: s.name,
    type: s.proxyType ?? 'vless',
    server: '',
    latencyMs: s.latencyMs ?? null,
    ...(s.countryCode ? { countryCode: s.countryCode } : {}),
    ...(s.transport ? { transport: s.transport } : {}),
    ...(s.securityType ? { security: s.securityType } : {}),
  }
}

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
const SELECTED_PROXY_LS_KEY = 'slave.settings.selectedProxy.v1'
// Timestamp of the most recent transition into "connected", so getStatus can
// report stable uptime instead of resetting connectedAt on every poll.
let connectedSince: number | null = null

// Reads the native partial status and normalizes it into a full VPNStatus.
// Native returns only { state, mode, protocol, lastError }; the renderer needs
// every VPNStatus field present and a stable connectedAt.
async function readNativeStatus(): Promise<VPNStatus> {
  try {
    const { status } = await SlaveVpn.getStatus()
    const state = (status?.state ?? 'disconnected') as VPNStatus['state']
    if (state === 'connected') {
      if (connectedSince === null) connectedSince = Date.now()
    } else {
      connectedSince = null
    }
    return {
      ...INITIAL_VPN_STATUS,
      state,
      mode: currentMode,
      protocol: null,
      connectedAt: connectedSince,
      lastError: status?.lastError ?? null,
      // Real exit node read from the mihomo SLAVE-SELECT group (null when idle).
      ...(status?.activeProxy ? { activeProxy: status.activeProxy } : {}),
    }
  } catch {
    return INITIAL_VPN_STATUS
  }
}

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

// Registered by events.onServerLatency; probeAll pushes per-node results here.
let serverLatencyCb: ((p: { proxyName: string; latencyMs: number | null; success: boolean }) => void) | null = null

// Android smart-routing mode (persisted) — passed to compile-config on connect.
const ROUTING_MODE_LS_KEY = 'slave.settings.routingMode.v1'
let currentRoutingMode: 'smart' | 'global' | 'direct' = 'smart'

// Map mihomo's clash-API connections snapshot JSON → ActiveConnectionsSnapshot.
function parseConnectionsSnapshot(raw: string): {
  uploadTotal: number; downloadTotal: number; count: number
  connections: unknown[]; fetchedAt: number
} | null {
  try {
    const s = JSON.parse(raw) as {
      uploadTotal?: number; downloadTotal?: number
      connections?: Array<{
        id?: string; upload?: number; download?: number; start?: string
        rule?: string; rulePayload?: string; chains?: string[]
        metadata?: Record<string, string>
      }>
    }
    const conns = (s.connections ?? []).map((c) => {
      const m = c.metadata ?? {}
      return {
        id: c.id ?? '',
        host: m['host'] || m['destinationIP'] || '',
        network: m['network'] ?? 'tcp',
        type: m['type'] ?? '',
        destinationIP: m['destinationIP'] ?? '',
        destinationPort: m['destinationPort'] ?? '',
        sourceIP: m['sourceIP'] ?? '',
        sourcePort: m['sourcePort'] ?? '',
        chain: Array.isArray(c.chains) && c.chains.length > 0 ? c.chains[0]! : '',
        rule: c.rule ?? '',
        upload: c.upload ?? 0,
        download: c.download ?? 0,
        start: c.start ?? '',
      }
    })
    return {
      uploadTotal: s.uploadTotal ?? 0,
      downloadTotal: s.downloadTotal ?? 0,
      count: conns.length,
      connections: conns,
      fetchedAt: Date.now(),
    }
  } catch {
    return null
  }
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
        const compiled = await compileMihomoConfigForAndroid({
          vpnMode: currentMode,
          ...(currentSelectedProxy ? { selectedProxy: currentSelectedProxy } : {}),
          utlsFingerprint: currentUtlsFingerprint,
          routingMode: currentRoutingMode,
        })
        await SlaveVpn.connect({
          config: compiled.config,
          ...(currentSelectedProxy ? { selectedProxy: currentSelectedProxy } : {}),
          vpnMode: currentMode,
        })
      }),
      disconnect: () => wrap(() => SlaveVpn.disconnect()),
      getStatus: () => wrap(() => readNativeStatus()),
      setMode: (payload: { mode: VPNMode }) => wrap(async () => {
        currentMode = payload.mode
        await SlaveVpn.setMode(payload).catch(() => undefined)
      }),
      getConnectivity: notImplemented('vpn.getConnectivity'),
      // ROOT CAUSE of "any choice → traffic via EE": the IPC contract is
      // VpnSetProxyPayload = { proxyName }, but this handler read `payload.proxy`
      // (undefined) — so the chosen name NEVER reached the native selectProxy and
      // SLAVE-SELECT stayed on its SLAVE-AUTO default (url-test → EE). Read
      // `proxyName`. (Instrumentally confirmed: Selector.Set DOES change the
      // route; the bug was the name never arriving.)
      // Param typed against the shared IPC contract (VpnSetProxyPayload) so the
      // proxy-vs-proxyName mismatch that broke switching can't recur — it would
      // now fail typecheck.
      setProxy: (payload: VpnSetProxyPayload) => wrap(async () => {
        const name = payload.proxyName
        nativeLog(`[bridge] setProxy(${name}) reached the native bridge`)
        if (!name) throw new Error('setProxy: proxyName is empty')
        currentSelectedProxy = name
        try { window.localStorage.setItem(SELECTED_PROXY_LS_KEY, name) } catch { /* swallow */ }
        // Live-switch the mihomo SLAVE-SELECT group. Native no-ops gracefully if
        // not connected — the choice is re-applied on the next connect via the
        // connect payload (and persisted by mihomo store-selected).
        await SlaveVpn.selectProxy({ name }).catch(() => undefined)
      }),
      getProxyList: () => wrap(async () => {
        // The list works disconnected too (the running core isn't required) —
        // it's the deduped subscription nodes, so the main screen never shows
        // "Серверы не загружены" once a subscription exists.
        const servers = await listAndroidServers()
        return servers.map(toProxyEntry)
      }),
      getConnections: () => wrap(async () => {
        try {
          const { snapshot } = await SlaveVpn.getConnections()
          return parseConnectionsSnapshot(snapshot)
        } catch {
          return null
        }
      }),
      closeConnection: notImplemented('vpn.closeConnection'),
      getBalancerState: notImplemented('vpn.getBalancerState'),
      setBalancerEnabled: notImplemented('vpn.setBalancerEnabled'),
      setBalancerMode: notImplemented('vpn.setBalancerMode'),
      probeAll: () => wrap(async () => {
        // URL-test every node via mihomo and push results to the store's
        // serverLatency map (drives the ms badges in the server list).
        const servers = await listAndroidServers()
        await Promise.all(servers.map(async (s) => {
          const { delay } = await SlaveVpn.testDelay({ name: s.name, timeout: 5000 }).catch(() => ({ delay: -1 }))
          serverLatencyCb?.({ proxyName: s.name, latencyMs: delay >= 0 ? delay : null, success: delay >= 0 })
        }))
      }),
    },

    subscriptions: {
      list: () => wrap(async () => (await listSubscriptions()).map(toIpcEntry)),
      add: (payload: { type: AndroidSubscriptionType; input: string; name?: string }) =>
        wrap(async () => {
          const entry = await addSubscription({
            type: payload.type,
            input: payload.input,
            ...(payload.name ? { name: payload.name } : {}),
          })
          invalidateServerCache()
          return toIpcEntry(entry)
        }),
      remove: (payload: { id: string }) => wrap(async () => {
        await removeSubscription(payload.id)
        invalidateServerCache()
      }),
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
        invalidateServerCache()
        await buildAggregatedYaml().catch(() => undefined)
        const list = await listSubscriptions()
        const entry = list.find(e => e.id === payload.id)
        if (!entry) throw new Error('Subscription not found')
        return toIpcEntry(entry)
      }),
      refreshAll: () => wrap(async () => {
        invalidateServerCache()
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
        // The native SlaveVpnService does NOT emit 'statusChanged' events, so a
        // native addListener would never fire and the UI would stay stuck on
        // "connecting" — never observing the error state / lastError after a
        // failed libbox start. Instead we POLL getStatus and push to the store
        // only when the state or error actually changes (avoids redundant sets).
        let lastState: string | null = null
        let lastError: string | null = null
        let stopped = false
        const tick = async (): Promise<void> => {
          if (stopped) return
          const status = await readNativeStatus()
          if (status.state !== lastState || status.lastError !== lastError) {
            lastState = status.state
            lastError = status.lastError
            cb(status)
          }
        }
        // Fire immediately, then on a 2s interval while mounted.
        void tick()
        const timer = setInterval(() => { void tick() }, 2000)
        return () => { stopped = true; clearInterval(timer) }
      },
      onVpnTraffic: (cb: (s: TrafficStats) => void) => {
        // Native emits no trafficUpdate event → poll getTraffic each second
        // (mihomo updates the per-second speed internally).
        let stopped = false
        const tick = async (): Promise<void> => {
          if (stopped) return
          try { const { traffic } = await SlaveVpn.getTraffic(); cb(traffic) } catch { /* ignore */ }
        }
        void tick()
        const timer = setInterval(() => { void tick() }, 1000)
        return () => { stopped = true; clearInterval(timer) }
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
      onServerLatency: (cb: (p: { proxyName: string; latencyMs: number | null; success: boolean }) => void) => {
        serverLatencyCb = cb
        return () => { if (serverLatencyCb === cb) serverLatencyCb = null }
      },
      onProxyChanged: (cb: (name: string) => void) => {
        // Drive the store's selectedProxy (active-server indication). Native
        // emits nothing, so we seed the persisted choice and then poll the real
        // active node (SLAVE-SELECT leaf) while running, emitting on change.
        let last: string | null = null
        let stopped = false
        const emit = (name: string | null | undefined): void => {
          if (name && name !== last) { last = name; cb(name) }
        }
        if (currentSelectedProxy) emit(currentSelectedProxy)
        const tick = async (): Promise<void> => {
          if (stopped) return
          try {
            const { status } = await SlaveVpn.getStatus()
            emit(status?.activeProxy ?? null)
          } catch { /* ignore */ }
        }
        void tick()
        const timer = setInterval(() => { void tick() }, 3000)
        return () => { stopped = true; clearInterval(timer) }
      },
      onBalancerState: () => () => undefined,
      onSubscriptionsChanged: () => () => undefined,
      onProfilesChanged: () => () => undefined,
      onGeoUpdaterState: () => () => undefined,
    },

    // ─── configSource — wired to the subscription store ──────────────────────
    // The OnboardingPage and SettingsPage save a single source via
    // configSource.set(). On Windows that writes a ConfigSourceMeta; on Android
    // there is no main process, so we MUST persist through the same durable
    // subscription store the Подписки tab uses — otherwise an onboarding-added
    // sub vanishes on relaunch AND hasAccess (= configSourceMeta !== null) stays
    // false, trapping the user in the onboarding loop every launch.
    configSource: {
      // hasAccess gate reads this: return a non-null meta whenever ≥1 sub exists
      // so the app skips onboarding after the first add.
      getMeta: () => wrap(async () => {
        const subs = await listSubscriptions()
        const first = subs[0]
        if (!first) return null
        const meta: ConfigSourceMetaShape = {
          type: first.type,
          displayName: first.name,
          addedAt: first.addedAt,
          ...(first.urlDomain ? { urlDomain: first.urlDomain } : {}),
          ...(first.proxyProtocol ? { proxyProtocol: first.proxyProtocol } : {}),
        }
        return meta
      }),
      // Persist via addSubscription so onboarding/settings adds survive relaunch
      // and feed the aggregator + server list exactly like the Подписки tab.
      set: (payload: { type: AndroidSubscriptionType; input: string }) => wrap(async () => {
        const entry = await addSubscription({ type: payload.type, input: payload.input.trim() })
        invalidateServerCache()
        const meta: ConfigSourceMetaShape = {
          type: entry.type,
          displayName: entry.name,
          addedAt: entry.addedAt,
          ...(entry.urlDomain ? { urlDomain: entry.urlDomain } : {}),
          ...(entry.proxyProtocol ? { proxyProtocol: entry.proxyProtocol } : {}),
        }
        return meta
      }),
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
      // SettingsPage "remove source" clears EVERY subscription on Android (the
      // single-source model maps to "all subs" here) so hasAccess flips back to
      // false and the UI returns to onboarding.
      clear: () => wrap(async () => {
        const subs = await listSubscriptions()
        for (const s of subs) await removeSubscription(s.id)
        invalidateServerCache()
      }),
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
      // Fetch + dedup nodes from every enabled subscription and map to the
      // Server[] shape the ServersPage expects. Returns [] (not an error) when
      // there are no subscriptions / no usable nodes so the UI shows its empty
      // state instead of an error overlay.
      list: () => wrap(async () => {
        try {
          return await listAndroidServers()
        } catch {
          return []
        }
      }),
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
      // Contract is RoutingScenarioInfo[] (an ARRAY). Returning an object here
      // made RoutingPage do `scenarios.map(...)` on a non-array → render crash
      // (react-router errorElement) the moment the Маршруты tab opened.
      listScenarios: async () => ok([] as never[]),
      setEnabledScenarios: async () => ok([] as never[]),
    },
    profiles: {
      list: async () => ok({ profiles: [], activeProfileId: null } as never),
      saveCurrent: notImplemented('profiles.saveCurrent'),
      remove: notImplemented('profiles.remove'),
      apply: notImplemented('profiles.apply'),
    },
    geo: {
      getState: async () =>
        ok({ records: [], lastFullUpdateAt: null, inProgress: false, intervalHours: 24 } as never),
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

  // Restore the persisted server choice so a reconnect re-applies it (the
  // connect payload carries selectedProxy; mihomo store-selected also persists).
  try {
    const saved = window.localStorage.getItem(SELECTED_PROXY_LS_KEY)
    if (saved) currentSelectedProxy = saved
  } catch { /* swallow */ }

  // Restore the persisted routing mode (Smart/Global/Direct). The Settings UI
  // writes this key; it's applied to the config on the next connect.
  try {
    const m = window.localStorage.getItem(ROUTING_MODE_LS_KEY)
    if (m === 'smart' || m === 'global' || m === 'direct') currentRoutingMode = m
  } catch { /* swallow */ }

  // Best-effort initial traffic ping so the sparkline doesn't NaN.
  void SlaveVpn.getTraffic().catch(() => ({ traffic: EMPTY_TRAFFIC_STATS }))

  // Seed currentMode from local cache if user set one previously
  void getSubscriptionInput('__pref_vpn_mode__').then(v => {
    if (v === 'full' || v === 'bypass' || v === 'split' || v === 'custom') currentMode = v
  })
}

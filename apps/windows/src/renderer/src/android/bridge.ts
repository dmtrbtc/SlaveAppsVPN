import { registerPlugin } from '@capacitor/core'
import type { VPNMode, VPNStatus, TrafficStats, Server } from '@slave-vpn/shared'
import type { VpnSetProxyPayload, RuntimeEvent } from '@shared/ipc/types'
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
import { buildAggregatedYaml, buildAggregatedProxies } from './aggregator'
import { pingProxies } from './ping'
import { listAndroidServers, invalidateServerCache } from './servers'
import { compileMihomoConfigForAndroid } from './compile-config'
import { detectClipboardLink } from './clipboard-detect'
import { getDnsPresets, getDnsStrategies, GEO_SOURCES, captureSnapshot, applySnapshot } from '@slave-vpn/core'
import type { AppSettings, UtlsFingerprintName } from '@slave-vpn/core'
import {
  loadProfiles, listProfiles, subscribeProfiles, getProfile,
  createProfile, removeProfile, markProfileApplied,
} from './profiles-store'
import { listScenarioMetadata } from '@slave-vpn/routing'
import { initAndroidSettings, androidSettings, patchAndroidSettings } from './settings-store'
import { createAndroidDataAdapters } from './adapters'
import { prefetchAndroidGeoSiteCategories } from './geosite-categories'

// Build the RoutingScenarioInfo[] the renderer expects from core scenario
// metadata + the currently enabled set (persisted in AppSettings.enabledScenarios).
function buildScenarioInfo(): unknown[] {
  const enabled = new Set(androidSettings().enabledScenarios)
  return listScenarioMetadata().map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    category: m.category,
    icon: m.icon,
    defaultEnabled: m.defaultEnabled,
    composable: m.composable,
    ruleCount: m.ruleCount,
    enabled: enabled.has(m.id),
  }))
}

// ─── Native plugin interface ──────────────────────────────────────────────────

interface NativeSlaveVpn {
  checkPermission(): Promise<{ granted: boolean }>
  requestPermission(): Promise<{ granted: boolean }>
  connect(options: { config: string; subscriptionId?: string; selectedProxy?: string; vpnMode?: VPNMode; splitMode?: string; splitApps?: string[] }): Promise<void>
  listApps(): Promise<{ apps: { packageName: string; label: string; system: boolean }[] }>
  disconnect(): Promise<void>
  getStatus(): Promise<{ status: { state?: string; mode?: string; protocol?: string; lastError?: string | null; activeProxy?: string | null } }>
  getTraffic(): Promise<{ traffic: TrafficStats }>
  getConnections(): Promise<{ snapshot: string }>
  getRuleProviders(): Promise<{ providers: string }>
  updateRuleProviders(): Promise<{ providers: string }>
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

// Parse one raw native/mihomo log line into a {level,time,msg} entry. The ring
// buffer holds lines like `2026-…T…Z INFO [service] …` or mihomo's
// `… level=warning msg="…"`, so derive the level (otherwise the level filter and
// colours in DiagnosticsPage never see anything but "info") and the timestamp.
function parseNativeLogLine(line: string): { level: string; time: number; msg: string } {
  const lower = line.toLowerCase()
  let level = 'info'
  if (/\b(fatal|panic)\b|level=fatal/.test(lower)) level = 'fatal'
  else if (/\berror\b|level=error/.test(lower)) level = 'error'
  else if (/\bwarn(ing)?\b|level=warning/.test(lower)) level = 'warn'
  else if (/\bdebug\b|level=debug/.test(lower)) level = 'debug'
  // Leading ISO-8601 timestamp, if present.
  const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/.exec(line)
  const time = iso ? Date.parse(iso[1]!) || Date.now() : Date.now()
  return { level, time, msg: line }
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

// ─── Native lifecycle guard (anti-regression) ───────────────────────────────
// HARD INVARIANT: the native clashbox/gojni core may be touched ONLY once the
// VPN is actually connected (the core is loaded by the foreground service on
// Connect). NO polling / diagnostics / UI side-effect may call a core-touching
// bridge method before then, otherwise it forces an early `System.loadLibrary`
// (the rc7 regression class). getStatus/getRuleProviders/updateRuleProviders/
// testDelay are already guarded natively (isRunning) and DON'T load the core;
// getTraffic + getConnections are NOT — so we gate them here in the renderer.
//
// `currentVpnState` is fed by readNativeStatus() (getStatus is core-safe). Only
// when it reads 'connected' do we let traffic/connections calls through.
let currentVpnState: string = 'disconnected'
function coreReady(): boolean {
  return currentVpnState === 'connected'
}

// Reads the native partial status and normalizes it into a full VPNStatus.
// Native returns only { state, mode, protocol, lastError }; the renderer needs
// every VPNStatus field present and a stable connectedAt.
async function readNativeStatus(): Promise<VPNStatus> {
  try {
    const { status } = await SlaveVpn.getStatus()
    const state = (status?.state ?? 'disconnected') as VPNStatus['state']
    currentVpnState = state
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
    currentVpnState = 'disconnected'
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

// Rule-provider (bypass list) status — shared shape with the DiagnosticsPage
// «Обновить списки» panel. Mirrors clashbox ruleProviderInfo.
export interface AndroidRuleProviderEntry {
  name: string
  behavior: string
  count: number
  ok: boolean
  error?: string
}
export interface AndroidRuleProvidersResult {
  providers: AndroidRuleProviderEntry[]
  updatedAt: number
}

function parseRuleProviders(raw: string): AndroidRuleProviderEntry[] {
  try {
    const arr = JSON.parse(raw) as Array<Partial<AndroidRuleProviderEntry>>
    if (!Array.isArray(arr)) return []
    return arr.map((p) => ({
      name: String(p.name ?? ''),
      behavior: String(p.behavior ?? ''),
      count: typeof p.count === 'number' ? p.count : 0,
      ok: p.ok !== false,
      ...(p.error ? { error: String(p.error) } : {}),
    }))
  } catch {
    return []
  }
}

// ─── Runtime events (T2) — POLLING fallback ─────────────────────────────────
// mihomo Alpha exposes NO connection/state event bus (verified: no EventChan /
// observable in the core), so we cannot subscribe to real push events. Instead
// we POLL getStatus + getConnections every 2s and emit a RuntimeEvent on each
// observed *change* (state transition, error, active-node switch, connection
// open/close). This is explicitly a fallback — the first emitted event says so —
// NOT a faithful event subscription.
type RuntimeEventInput = Pick<RuntimeEvent, 'kind' | 'severity' | 'message'> & { metadata?: Record<string, unknown> }
const runtimeEventSubs = new Set<(e: RuntimeEvent) => void>()
let runtimeEventSeq = 0

function emitRuntimeEvent(input: RuntimeEventInput): void {
  const ev: RuntimeEvent = {
    id: `evt-${Date.now()}-${runtimeEventSeq++}`,
    kind: input.kind,
    severity: input.severity,
    timestamp: Date.now(),
    message: input.message,
    ...(input.metadata ? { metadata: input.metadata } : {}),
  }
  for (const cb of runtimeEventSubs) { try { cb(ev) } catch { /* ignore */ } }
}

function stateToKind(state: string): RuntimeEvent['kind'] {
  if (state === 'connected') return 'vpn.connected'
  if (state === 'disconnected') return 'vpn.disconnected'
  if (state === 'error') return 'vpn.error'
  return 'vpn.state_changed'
}

let runtimePollTimer: ReturnType<typeof setInterval> | null = null
let lastRuntimeState: string | null = null
let lastRuntimeError: string | null = null
let lastRuntimeActive: string | null = null
let lastConnIds = new Set<string>()

function startRuntimePolling(): void {
  if (runtimePollTimer) return
  emitRuntimeEvent({
    kind: 'vpn.state_changed',
    severity: 'debug',
    message: 'Поток runtime-событий: опрос ядра каждые 2с (mihomo Alpha без шины событий — fallback)',
  })
  const tick = async (): Promise<void> => {
    // Status diff → state / error / active-node events.
    try {
      const status = await readNativeStatus()
      if (status.state !== lastRuntimeState) {
        const prev = lastRuntimeState
        lastRuntimeState = status.state
        emitRuntimeEvent({
          kind: stateToKind(status.state),
          severity: status.state === 'error' ? 'error' : 'info',
          message: `Состояние: ${prev ?? '—'} → ${status.state}`,
        })
      }
      if (status.lastError && status.lastError !== lastRuntimeError) {
        lastRuntimeError = status.lastError
        emitRuntimeEvent({ kind: 'vpn.error', severity: 'error', message: status.lastError })
      }
      const active = status.activeProxy ?? null
      if (active && active !== lastRuntimeActive) {
        lastRuntimeActive = active
        emitRuntimeEvent({ kind: 'proxy.selected', severity: 'info', message: `Активный узел: ${active}` })
      }
    } catch { /* ignore */ }
    // Connections diff → open / close events. GUARDED: getConnections touches the
    // native core (loads gojni), so skip entirely unless actually connected. The
    // status diff above uses getStatus, which is core-safe.
    if (!coreReady()) { lastConnIds = new Set(); return }
    try {
      const { snapshot } = await SlaveVpn.getConnections()
      const snap = parseConnectionsSnapshot(snapshot)
      if (snap) {
        const ids = new Set<string>()
        for (const conn of snap.connections as Array<{ id: string; host: string; destinationIP: string; chain: string; rule: string }>) {
          ids.add(conn.id)
          if (!lastConnIds.has(conn.id)) {
            const target = conn.host || conn.destinationIP || conn.id.slice(0, 8)
            emitRuntimeEvent({
              kind: 'connection.opened',
              severity: 'debug',
              message: `+ ${target} → ${conn.chain || 'DIRECT'}${conn.rule ? ` [${conn.rule}]` : ''}`,
            })
          }
        }
        for (const id of lastConnIds) {
          if (!ids.has(id)) {
            emitRuntimeEvent({ kind: 'connection.closed', severity: 'debug', message: `− соединение ${id.slice(0, 8)} закрыто` })
          }
        }
        lastConnIds = ids
      }
    } catch { /* ignore */ }
  }
  void tick()
  runtimePollTimer = setInterval(() => { void tick() }, 2000)
}

function stopRuntimePolling(): void {
  if (runtimePollTimer) { clearInterval(runtimePollTimer); runtimePollTimer = null }
  lastConnIds = new Set()
  lastRuntimeState = null
  lastRuntimeError = null
  lastRuntimeActive = null
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
        const s = androidSettings()
        await SlaveVpn.connect({
          config: compiled.config,
          ...(currentSelectedProxy ? { selectedProxy: currentSelectedProxy } : {}),
          vpnMode: currentMode,
          // Per-app split tunnel (native VpnService addAllowed/DisallowedApplication).
          splitMode: s.splitTunnelMode ?? 'off',
          splitApps: s.splitProcessList ?? [],
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
        // GUARDED: getConnections loads the native core — never call it before
        // connected (the ActiveConnectionsPanel polls this).
        if (!coreReady()) return null
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
        // Task 1 — NON-NATIVE ping. Measure each node's edge RTT via CapacitorHttp
        // (OkHttp), NOT the clashbox core, so latency works even disconnected and
        // never triggers an early native init. Results feed the same serverLatency
        // map (ms badges) — contract unchanged. Does not affect connect/balancer.
        const { proxies } = await buildAggregatedProxies()
        await pingProxies(
          proxies.map(p => ({ name: p.name, server: p.server, port: p.port })),
          (r) => serverLatencyCb?.({ proxyName: r.name, latencyMs: r.latencyMs, success: r.latencyMs !== null }),
        )
      }),
      // T1 «Обновить списки»: force-refresh the RKN bypass rule-providers in the
      // running mihomo core and report per-provider count/errors. Rejects (native)
      // when the core isn't running — the lists live in the engine.
      getRuleProviders: () => wrap(async (): Promise<AndroidRuleProvidersResult> => {
        const { providers } = await SlaveVpn.getRuleProviders()
        return { providers: parseRuleProviders(providers), updatedAt: Date.now() }
      }),
      updateRuleProviders: () => wrap(async (): Promise<AndroidRuleProvidersResult> => {
        const { providers } = await SlaveVpn.updateRuleProviders()
        const parsed = parseRuleProviders(providers)
        emitRuntimeEvent({
          kind: 'rules.updated',
          severity: parsed.some(p => !p.ok) ? 'warning' : 'info',
          message: `Списки обхода обновлены: ${parsed.map(p => `${p.name}=${p.count}`).join(', ') || 'нет провайдеров'}`,
        })
        return { providers: parsed, updatedAt: Date.now() }
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
      // System info from the WebView (no Node). Memory-free/system-uptime aren't
      // available on Android — the DiagnosticsPage hides those tiles on mobile.
      collect: () => wrap(async () => {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
        const osMatch = /Android\s+([\d.]+)/i.exec(ua)
        const archMatch = /(arm64|aarch64|armv8|armv7|x86_64|x86)/i.exec(ua)
        const arch = (archMatch?.[1] ?? 'arm64').toLowerCase().replace(/aarch64|armv8/, 'arm64')
        const deviceMem = (navigator as unknown as { deviceMemory?: number }).deviceMemory
        let mihomoVersion: string | null = null
        try {
          mihomoVersion = ((await readNativeStatus()) as { engineVersion?: string | null }).engineVersion ?? null
        } catch {
          /* not connected yet */
        }
        return {
          platform: 'android',
          arch,
          osVersion: osMatch ? `Android ${osMatch[1]}` : 'Android',
          appVersion: __APP_VERSION__,
          mihomoVersion,
          totalMemoryMb: typeof deviceMem === 'number' ? Math.round(deviceMem * 1024) : 0,
          freeMemoryMb: 0,
          uptime: Math.floor((typeof performance !== 'undefined' ? performance.now() : 0) / 1000),
        } as never
      }),
      exportLogs: notImplemented('diagnostics.exportLogs'),
      getLogs: () => wrap(async () => {
        const { lines } = await SlaveVpn.getLogs({ tail: 500 })
        return lines.map(parseNativeLogLine)
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
        // (mihomo updates the per-second speed internally). GUARDED: getTraffic
        // loads the native core, so while NOT connected we emit zeros and never
        // touch the core (this is what forced an early gojni load in rc6/rc7).
        let stopped = false
        const tick = async (): Promise<void> => {
          if (stopped) return
          if (!coreReady()) { cb(EMPTY_TRAFFIC_STATS); return }
          try { const { traffic } = await SlaveVpn.getTraffic(); cb(traffic) } catch { /* ignore */ }
        }
        void tick()
        const timer = setInterval(() => { void tick() }, 1000)
        return () => { stopped = true; clearInterval(timer) }
      },
      onVpnError: () => () => undefined,
      onVpnHealth: () => () => undefined,
      // T2: real runtime-event stream via the polling fallback above. The first
      // subscriber starts the 2s poller; the last to unsubscribe stops it.
      onRuntimeEvent: (cb: (e: RuntimeEvent) => void) => {
        runtimeEventSubs.add(cb)
        startRuntimePolling()
        return () => {
          runtimeEventSubs.delete(cb)
          if (runtimeEventSubs.size === 0) stopRuntimePolling()
        }
      },
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
      onProfilesChanged: (cb: (s: { profiles: unknown[]; activeProfileId: string | null }) => void) =>
        subscribeProfiles(cb as (s: ReturnType<typeof listProfiles>) => void),
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
      // Full AppSettings now persists durably via core.SettingsStore; the live
      // cache (currentMode/currentUtlsFingerprint) is overlaid so an in-flight
      // change is reflected even before the async store write resolves.
      get: async () =>
        ok({
          ...androidSettings(),
          vpnMode: currentMode,
          utlsFingerprint: currentUtlsFingerprint as UtlsFingerprintName,
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
        // Persist the whole patch durably (dnsPreset/dnsStrategy/enabledScenarios/…).
        await patchAndroidSettings(payload as Partial<AppSettings>)
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
      // Task 1 — NON-NATIVE ping (the ServersPage refresh button calls this).
      // Edge-RTT probe via CapacitorHttp (OkHttp), never the clashbox core, so it
      // works disconnected and triggers no native init. Pushes live results to
      // onServerLatency (ms badges). Independent of connect/balancer/routing.
      probe: () => wrap(async () => {
        const { proxies } = await buildAggregatedProxies()
        await pingProxies(
          proxies.map(p => ({ name: p.name, server: p.server, port: p.port })),
          (r) => serverLatencyCb?.({ proxyName: r.name, latencyMs: r.latencyMs, success: r.latencyMs !== null }),
        )
      }),
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
      // Preset + strategy catalogues now come from @slave-vpn/core (shared with
      // Windows) instead of empty stubs, so the DNS screen shows real options.
      getPresets: async () => ok(getDnsPresets() as never),
      getStrategies: async () => ok(getDnsStrategies() as never),
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
      // Android split = per-app VPN. The package list + mode live in AppSettings
      // (splitProcessList / splitTunnelMode), applied natively at connect.
      getProcessList: () => wrap(async () => (androidSettings().splitProcessList ?? []) as never),
      setProcessList: (payload: { processList: string[] }) => wrap(async () => {
        await patchAndroidSettings({ splitProcessList: payload.processList ?? [] })
        return undefined as never
      }),
      listApps: () => wrap(async () => {
        const { apps } = await SlaveVpn.listApps()
        return apps as never
      }),
    },
    routing: {
      // Real scenario catalogue from @slave-vpn/core (shared with Windows). The
      // enabled set persists in AppSettings.enabledScenarios. NOTE: the selection
      // starts driving the actual config in P1 (compile-config switch); for now
      // it lists + persists so the Маршруты screen is real instead of a stub.
      listScenarios: async () => ok(buildScenarioInfo() as never),
      setEnabledScenarios: (payload: { scenarioIds?: string[] }) =>
        wrap(async () => {
          const valid = new Set<string>(listScenarioMetadata().map((m) => m.id))
          const filtered = (payload.scenarioIds ?? []).filter((id) => valid.has(id))
          await patchAndroidSettings({ enabledScenarios: filtered })
          return buildScenarioInfo() as never
        }),
    },
    profiles: {
      // Quick-switch profiles over the durable Android store + core snapshot
      // transforms. apply() persists the settings slice; it takes effect on the
      // next connect (no live hot-reload of the running tunnel on Android yet).
      list: () => wrap(async () => {
        await loadProfiles()
        return listProfiles() as never
      }),
      saveCurrent: (payload: { name: string; description?: string }) => wrap(async () => {
        await loadProfiles()
        const snapshot = captureSnapshot(androidSettings())
        return (await createProfile(payload, snapshot)) as never
      }),
      remove: (payload: { id: string }) => wrap(async () => {
        await loadProfiles()
        await removeProfile(payload.id)
        return undefined as never
      }),
      apply: (payload: { id: string; hotReload?: boolean }) => wrap(async () => {
        await loadProfiles()
        const profile = getProfile(payload.id)
        if (!profile) throw new Error('Профиль не найден')
        await patchAndroidSettings(applySnapshot(profile.snapshot))
        return ((await markProfileApplied(payload.id)) ?? profile) as never
      }),
    },
    geo: {
      getState: async () =>
        ok({ records: [], lastFullUpdateAt: null, inProgress: false, intervalHours: 24 } as never),
      updateAll: notImplemented('geo.updateAll'),
      updateOne: notImplemented('geo.updateOne'),
      // Geo source catalogue from @slave-vpn/core (shared with Windows).
      listSources: async () =>
        ok(
          GEO_SOURCES.map((s) => ({
            id: s.id,
            label: s.label,
            url: s.url,
            filename: s.filename,
            category: s.category,
          })) as never,
        ),
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

  // (rc8 guard) Removed the install-time `SlaveVpn.getTraffic()` ping: it forced
  // the native gojni core to load at app launch. The sparkline reads
  // EMPTY_TRAFFIC_STATS until connected, then onVpnTraffic feeds real numbers.

  // Hydrate the durable core settings store, migrating the legacy per-key prefs
  // (old vpnMode cache + uTLS) on first run, then adopt the store as the source
  // of truth for the live cache.
  void (async () => {
    const oldMode = await getSubscriptionInput('__pref_vpn_mode__')
    const seedMode =
      oldMode === 'full' || oldMode === 'bypass' || oldMode === 'split' || oldMode === 'custom'
        ? (oldMode as VPNMode)
        : undefined
    const s = await initAndroidSettings({
      ...(seedMode ? { vpnMode: seedMode } : {}),
      utlsFingerprint: currentUtlsFingerprint as UtlsFingerprintName,
    })
    currentMode = s.vpnMode
    currentUtlsFingerprint = s.utlsFingerprint
  })()

  // Warm up the geosite category cache (≈4 MB MetaCubeX dat, fetched at most
  // weekly) so the first scenario-driven connect can drop GEOSITE rules for
  // categories absent from the native engine's dat (P1.b consumes this).
  try {
    const adapters = createAndroidDataAdapters()
    prefetchAndroidGeoSiteCategories(adapters.network, adapters.storage)
  } catch {
    /* non-fatal */
  }
}

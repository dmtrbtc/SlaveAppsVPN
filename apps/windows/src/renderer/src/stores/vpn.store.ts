import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { VPNStatus, TrafficStats, VPNMode } from '@slave-vpn/shared'
import { INITIAL_VPN_STATUS, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import type { VpnHealthPayload, ProxyEntry, BalancerState, BalancerMode } from '@shared/ipc/types'
import { vpnApi, settingsApi, events } from '../lib/api'
import { IS_MOBILE } from '../lib/platform'

// Must match SLAVE_AUTO_GROUP in @slave-vpn/config. Selecting it points
// SLAVE-SELECT at the url-test autobalancer instead of a fixed node.
export const AUTO_GROUP = 'SLAVE-AUTO'

interface VpnStore {
  status: VPNStatus
  traffic: TrafficStats
  health: VpnHealthPayload | null
  engineVersion: string | null
  reconnectAttempts: number
  connectionStartedAt: number | null
  proxyList: ProxyEntry[]
  balancerState: BalancerState | null
  // The user's explicit target: a specific node name, or AUTO_GROUP ("SLAVE-AUTO")
  // when the autobalancer is chosen. Persisted via the bridge.
  selectedProxy: string | null
  // The REAL leaf node currently carrying traffic (resolved through SLAVE-SELECT →
  // SLAVE-AUTO → node). In Auto mode this differs from selectedProxy and drives
  // the Dashboard "Авто → Slave-NL (12ms)" readout.
  activeProxy: string | null
  // Live latency map populated from EVENT_SERVER_LATENCY — shared by
  // ServersPage, ConnectionTargetSelector, and any future UI that needs it.
  serverLatency: Record<string, number | null>
  serverLatencyUpdatedAt: number

  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setMode: (mode: VPNMode) => Promise<void>
  fetchStatus: () => Promise<void>
  setEngineVersion: (v: string | null) => void
  fetchProxyList: () => Promise<void>
  setProxy: (name: string) => Promise<void>
  setBalancerEnabled: (enabled: boolean) => Promise<void>
  setBalancerMode: (mode: BalancerMode) => Promise<void>
  subscribeToEvents: () => () => void
}

function deriveConnectionMeta(
  prev: Pick<VpnStore, 'status' | 'reconnectAttempts' | 'connectionStartedAt'>,
  next: VPNStatus
): Pick<VpnStore, 'reconnectAttempts' | 'connectionStartedAt'> {
  const prevState = prev.status.state
  const nextState = next.state
  const now = Date.now()

  const connectionStartedAt =
    nextState === 'connecting' && prevState !== 'connecting' && prevState !== 'reconnecting'
      ? now
      : nextState === 'disconnected' || nextState === 'error'
      ? null
      : prev.connectionStartedAt

  const reconnectAttempts =
    nextState === 'reconnecting' && prevState !== 'reconnecting'
      ? prev.reconnectAttempts + 1
      : nextState === 'connected' || nextState === 'disconnected'
      ? 0
      : prev.reconnectAttempts

  return { connectionStartedAt, reconnectAttempts }
}

export const useVpnStore = create<VpnStore>()(
  subscribeWithSelector((set, get) => ({
    status: INITIAL_VPN_STATUS,
    traffic: EMPTY_TRAFFIC_STATS,
    health: null,
    engineVersion: null,
    reconnectAttempts: 0,
    connectionStartedAt: null,
    proxyList: [],
    balancerState: null,
    selectedProxy: null,
    activeProxy: null,
    serverLatency: {},
    serverLatencyUpdatedAt: 0,

    connect: async () => {
      const state = get().status.state
      if (state === 'connecting' || state === 'connected') return
      const now = Date.now()
      set(s => ({
        status: { ...s.status, state: 'connecting', lastError: null },
        connectionStartedAt: now,
        reconnectAttempts: 0,
      }))
      try {
        await vpnApi.connect()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set(s => ({ status: { ...s.status, state: 'error', lastError: message }, connectionStartedAt: null }))
      }
    },

    disconnect: async () => {
      const state = get().status.state
      if (state === 'disconnecting' || state === 'disconnected') return
      set(s => ({ status: { ...s.status, state: 'disconnecting' } }))
      try {
        await vpnApi.disconnect()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set(s => ({ status: { ...s.status, state: 'error', lastError: message } }))
      }
    },

    setMode: async (mode: VPNMode) => {
      await vpnApi.setMode(mode)
      set(s => ({ status: { ...s.status, mode } }))
    },

    fetchStatus: async () => {
      try {
        const status = await vpnApi.getStatus()
        set(s => ({ status, ...deriveConnectionMeta(s, status) }))
      } catch {
        // Non-fatal
      }
    },

    setEngineVersion: (v) => set({ engineVersion: v }),

    fetchProxyList: async () => {
      try {
        const list = await vpnApi.getProxyList()
        set({ proxyList: list })
      } catch {
        // Non-fatal
      }
    },

    setProxy: async (name: string) => {
      try {
        const vpnState = get().status.state
        if (vpnState === 'connected') {
          await vpnApi.setProxy({ proxyName: name })
        } else if (IS_MOBILE) {
          // Android: settingsApi has no main process to read it on connect, so
          // route through the bridge (it persists the choice + applies it on the
          // next connect; the live-switch is a safe no-op while disconnected).
          await vpnApi.setProxy({ proxyName: name })
        } else {
          await settingsApi.set({ selectedProxy: name })
        }
        set({ selectedProxy: name })
      } catch {
        // Non-fatal
      }
    },

    setBalancerEnabled: async (enabled: boolean) => {
      try {
        await vpnApi.setBalancerEnabled({ enabled })
        const state = await vpnApi.getBalancerState()
        set({ balancerState: state })
      } catch {
        // Non-fatal
      }
    },

    setBalancerMode: async (mode: BalancerMode) => {
      try {
        await vpnApi.setBalancerMode({ mode })
        const state = await vpnApi.getBalancerState()
        set({ balancerState: state })
      } catch {
        // Non-fatal
      }
    },

    subscribeToEvents: () => {
      const unsubStatus = events.onVpnStatus(status => {
        set(s => ({ status, ...deriveConnectionMeta(s, status) }))
      })
      const unsubTraffic = events.onVpnTraffic(traffic => set({ traffic }))
      const unsubError = events.onVpnError(({ message }) => {
        set(s => ({
          status: { ...s.status, state: 'error', lastError: message },
          connectionStartedAt: null,
        }))
      })
      const unsubHealth = events.onVpnHealth(health => set({ health }))
      const unsubBalancer = events.onBalancerState(balancerState => set({ balancerState }))
      const unsubProxyChanged = events.onProxyChanged(leaf => set(s => {
        // A seeded value equal to AUTO_GROUP is the explicit target (the group),
        // not a leaf — record the Auto selection but leave activeProxy for the
        // real node once the core resolves it.
        if (leaf === AUTO_GROUP) return { selectedProxy: AUTO_GROUP }
        // The polled value is the REAL leaf node. In Auto mode keep the explicit
        // SLAVE-AUTO target intact (don't clobber it) and only record the leaf in
        // activeProxy; otherwise mirror it into both.
        if (s.selectedProxy === AUTO_GROUP) return { activeProxy: leaf }
        return { selectedProxy: leaf, activeProxy: leaf }
      }))
      const unsubLatency = events.onServerLatency(payload => {
        set(s => ({
          serverLatency: {
            ...s.serverLatency,
            [payload.proxyName]: payload.success ? payload.latencyMs : null,
          },
          serverLatencyUpdatedAt: Date.now(),
        }))
      })
      return () => {
        unsubStatus()
        unsubTraffic()
        unsubError()
        unsubHealth()
        unsubBalancer()
        unsubProxyChanged()
        unsubLatency()
      }
    },
  }))
)

export const selectVpnStatus = (s: VpnStore) => s.status
export const selectVpnTraffic = (s: VpnStore) => s.traffic
export const selectVpnHealth = (s: VpnStore) => s.health
export const selectConnectionState = (s: VpnStore) => s.status.state
export const selectVpnMode = (s: VpnStore) => s.status.mode
export const selectEngineVersion = (s: VpnStore) => s.engineVersion
export const selectReconnectAttempts = (s: VpnStore) => s.reconnectAttempts
export const selectConnectionStartedAt = (s: VpnStore) => s.connectionStartedAt
export const selectProxyList = (s: VpnStore) => s.proxyList
export const selectBalancerState = (s: VpnStore) => s.balancerState
export const selectSelectedProxy = (s: VpnStore) => s.selectedProxy
export const selectActiveProxy = (s: VpnStore) => s.activeProxy
export const selectServerLatency = (s: VpnStore) => s.serverLatency
// True when the user picked the autobalancer (SLAVE-AUTO) rather than a fixed node.
export const selectAutoMode = (s: VpnStore) => s.selectedProxy === AUTO_GROUP

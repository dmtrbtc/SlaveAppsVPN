import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { VPNStatus, TrafficStats, VPNMode } from '@slave-vpn/shared'
import { INITIAL_VPN_STATUS, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import type { VpnHealthPayload } from '@shared/ipc/types'
import { vpnApi, events } from '../lib/api'

interface VpnStore {
  status: VPNStatus
  traffic: TrafficStats
  health: VpnHealthPayload | null
  engineVersion: string | null
  reconnectAttempts: number
  connectionStartedAt: number | null

  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setMode: (mode: VPNMode) => Promise<void>
  fetchStatus: () => Promise<void>
  setEngineVersion: (v: string | null) => void
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
        throw err
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
        throw err
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
      return () => {
        unsubStatus()
        unsubTraffic()
        unsubError()
        unsubHealth()
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

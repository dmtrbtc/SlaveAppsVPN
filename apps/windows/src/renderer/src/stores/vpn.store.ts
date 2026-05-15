import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { VPNStatus, TrafficStats, VPNMode } from '@slave-vpn/shared'
import { INITIAL_VPN_STATUS, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import { vpnApi, events } from '../lib/api'

interface VpnStore {
  status: VPNStatus
  traffic: TrafficStats
  engineVersion: string | null

  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setMode: (mode: VPNMode) => Promise<void>
  fetchStatus: () => Promise<void>
  setEngineVersion: (v: string | null) => void
  subscribeToEvents: () => () => void
}

export const useVpnStore = create<VpnStore>()(
  subscribeWithSelector((set, get) => ({
    status: INITIAL_VPN_STATUS,
    traffic: EMPTY_TRAFFIC_STATS,
    engineVersion: null,

    connect: async () => {
      const state = get().status.state
      if (state === 'connecting' || state === 'connected') return
      set(s => ({ status: { ...s.status, state: 'connecting' } }))
      try {
        await vpnApi.connect()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        set(s => ({ status: { ...s.status, state: 'error', lastError: message } }))
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
        set({ status })
      } catch {
        // Non-fatal: keep current status if fetch fails
      }
    },

    setEngineVersion: (v) => set({ engineVersion: v }),

    subscribeToEvents: () => {
      const unsubStatus = events.onVpnStatus(status => set({ status }))
      const unsubTraffic = events.onVpnTraffic(traffic => set({ traffic }))
      const unsubError = events.onVpnError(({ message }) => {
        set(s => ({ status: { ...s.status, state: 'error', lastError: message } }))
      })
      return () => {
        unsubStatus()
        unsubTraffic()
        unsubError()
      }
    },
  }))
)

// Stable selectors — import these instead of inline arrow functions to avoid
// recreating selector references on every render
export const selectVpnStatus = (s: VpnStore) => s.status
export const selectVpnTraffic = (s: VpnStore) => s.traffic
export const selectConnectionState = (s: VpnStore) => s.status.state
export const selectVpnMode = (s: VpnStore) => s.status.mode
export const selectEngineVersion = (s: VpnStore) => s.engineVersion

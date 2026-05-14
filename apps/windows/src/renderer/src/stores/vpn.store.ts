import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { VPNStatus, TrafficStats, VPNMode } from '@slave-vpn/shared'
import { INITIAL_VPN_STATUS, EMPTY_TRAFFIC_STATS } from '@slave-vpn/shared'
import { ipc } from '../lib/ipc'

interface VpnStore {
  status: VPNStatus
  traffic: TrafficStats
  isConnecting: boolean
  isDisconnecting: boolean
  engineVersion: string | null

  connect: () => Promise<void>
  disconnect: () => Promise<void>
  setMode: (mode: VPNMode) => Promise<void>
  fetchStatus: () => Promise<void>
  subscribeToEvents: () => () => void
  setEngineVersion: (v: string | null) => void
}

export const useVpnStore = create<VpnStore>()(
  subscribeWithSelector((set, get) => ({
    status: INITIAL_VPN_STATUS,
    traffic: EMPTY_TRAFFIC_STATS,
    isConnecting: false,
    isDisconnecting: false,
    engineVersion: null,

    connect: async () => {
      if (get().isConnecting) return
      set({ isConnecting: true })
      try {
        await ipc.vpn.connect()
      } finally {
        set({ isConnecting: false })
      }
    },

    disconnect: async () => {
      if (get().isDisconnecting) return
      set({ isDisconnecting: true })
      try {
        await ipc.vpn.disconnect()
      } finally {
        set({ isDisconnecting: false })
      }
    },

    setMode: async (mode: VPNMode) => {
      await ipc.vpn.setMode({ mode })
      set(state => ({ status: { ...state.status, mode } }))
    },

    fetchStatus: async () => {
      const status = await ipc.vpn.getStatus()
      if (status) set({ status })
    },

    subscribeToEvents: () => {
      const unsubStatus = ipc.events.onVpnStatus(status => set({ status }))
      const unsubTraffic = ipc.events.onVpnTraffic(traffic => set({ traffic }))
      const unsubError = ipc.events.onVpnError(({ message }) => {
        set(state => ({
          status: { ...state.status, state: 'error', lastError: message },
        }))
      })
      return () => {
        unsubStatus()
        unsubTraffic()
        unsubError()
      }
    },

    setEngineVersion: (engineVersion) => set({ engineVersion }),
  }))
)

export const vpnStatusSelector = (s: VpnStore) => s.status
export const vpnTrafficSelector = (s: VpnStore) => s.traffic
export const vpnConnectionState = (s: VpnStore) => s.status.state

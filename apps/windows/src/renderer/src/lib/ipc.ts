import type { SlaveVPNBridge } from '@shared/ipc/types'

declare global {
  interface Window {
    slaveVPN: SlaveVPNBridge
  }
}

export const ipc: SlaveVPNBridge = window.slaveVPN

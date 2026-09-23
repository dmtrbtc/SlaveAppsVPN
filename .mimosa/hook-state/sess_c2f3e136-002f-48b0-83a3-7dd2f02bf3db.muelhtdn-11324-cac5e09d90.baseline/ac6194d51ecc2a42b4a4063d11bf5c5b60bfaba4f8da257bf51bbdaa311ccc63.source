import type { SlaveVPNBridge } from '@shared/ipc/types'

declare global {
  interface Window {
    slaveVPN: SlaveVPNBridge
  }
}

// Prefer importing from lib/api/* (adapter layer with IpcResult unwrapping + null guard).
// This export is kept for direct event subscriptions where unwrapping is not needed.
export const ipc: SlaveVPNBridge = new Proxy({} as SlaveVPNBridge, {
  get(_target, prop: string) {
    if (!window.slaveVPN) {
      throw new Error(`[IPC] Bridge not ready — attempted to access 'slaveVPN.${prop}'`)
    }
    return window.slaveVPN[prop as keyof SlaveVPNBridge]
  },
})

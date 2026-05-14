/// <reference types="vite/client" />

import type { SlaveVPNBridge } from '../../shared/ipc/types'

declare global {
  interface Window {
    slaveVPN: SlaveVPNBridge
  }
}

declare const __APP_VERSION__: string

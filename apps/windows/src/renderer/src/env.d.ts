/// <reference types="vite/client" />

import type { SlaveVPNBridge } from '../../shared/ipc/types'

declare global {
  interface Window {
    slaveVPN: SlaveVPNBridge
  }

  // Injected by electron.vite.config.ts `define` (buildDefines). These must live
  // INSIDE `declare global` because this file is a module (it imports), so a
  // top-level `declare const` would be module-scoped and invisible to the app.
  const __APP_VERSION__: string
  const __APP_COMMIT__: string
  const __BUILD_TIMESTAMP__: string
}

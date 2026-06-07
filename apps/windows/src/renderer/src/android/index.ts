import { installAndroidBridge } from './bridge'
import { installStubBridge } from './stub-bridge'

/**
 * Bridge install policy: if window.slaveVPN is already present (Electron
 * preload exposed it via contextBridge), do nothing. Otherwise install the
 * Capacitor bridge synchronously — it talks to native plugins on Android
 * and is a harmless no-op stub for everything else.
 *
 * The bridge module is statically imported (no dynamic chunk). Lazy-loading
 * caused vite to leave the CJS deps (@slave-vpn/config, @slave-vpn/dns)
 * untranspiled in their own chunk, which crashes on WebView with
 * "export is not defined". Bundling them in main is ~30 KB extra on
 * Windows where they don't run — acceptable trade for correctness.
 */
export function installAndroidBridgeIfNeeded(): void {
  if (typeof window === 'undefined') return
  const existing = (window as unknown as { slaveVPN?: unknown }).slaveVPN
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('[android-bridge] window.slaveVPN already set — skipping install')
    return
  }
  // eslint-disable-next-line no-console
  console.log('[android-bridge] window.slaveVPN missing — installing Capacitor bridge')
  try {
    installAndroidBridge()
    const finalBridge = (window as unknown as { slaveVPN?: unknown }).slaveVPN
    // eslint-disable-next-line no-console
    console.log('[android-bridge] installed; window.slaveVPN =', typeof finalBridge)
    if (!finalBridge) {
      installStubBridge('bridge function ran without setting window.slaveVPN')
    }
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    // eslint-disable-next-line no-console
    console.error('[android-bridge] install failed', err)
    installStubBridge(message)
  }
}

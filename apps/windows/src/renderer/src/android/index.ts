import { installStubBridge } from './stub-bridge'

/**
 * Bridge install policy: if window.slaveVPN is already present (Electron
 * preload exposed it via contextBridge), do nothing. Otherwise dynamic-
 * import the Capacitor bridge module. If that import fails for any reason
 * (chunk fetch error, @capacitor/* init throw, …) install a stub bridge so
 * the renderer at least has a window.slaveVPN with informative errors —
 * better than the generic "preload not initialized" message that gives
 * the user no hint about what went wrong.
 *
 * Always installing if no bridge is strictly safer than gating on Capacitor
 * detection — Windows already has a bridge before this code runs, so we
 * never overwrite it.
 */
export async function installAndroidBridgeIfNeeded(): Promise<void> {
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
    const mod = await import('./bridge')
    mod.installAndroidBridge()
    const finalBridge = (window as unknown as { slaveVPN?: unknown }).slaveVPN
    // eslint-disable-next-line no-console
    console.log('[android-bridge] installed; window.slaveVPN =', typeof finalBridge)
    if (!finalBridge) {
      installStubBridge('bridge module ran without setting window.slaveVPN')
    }
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    // eslint-disable-next-line no-console
    console.error('[android-bridge] install failed', err)
    installStubBridge(message)
  }
}

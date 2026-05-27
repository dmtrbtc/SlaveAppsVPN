import { isCapacitorAndroid } from './detect'

/**
 * Activate the Android bridge if we're running inside a Capacitor Android
 * shell. On Windows/Electron this is a no-op — the dynamic import only fires
 * when needed, keeping @capacitor/* code out of the Windows hot path.
 *
 * Fallback strategy: if @capacitor/core's runtime check says we're not
 * native, but `window.Capacitor` is present, assume something is off with
 * the detection and install anyway — the alternative (no bridge at all)
 * is strictly worse than a bridge whose native calls may stub.
 */
export async function installAndroidBridgeIfNeeded(): Promise<void> {
  const ok = isCapacitorAndroid()
  const hasCapacitorGlobal = typeof window !== 'undefined'
    && Boolean((window as unknown as { Capacitor?: unknown }).Capacitor)

  // eslint-disable-next-line no-console
  console.log('[android-bridge] gate', { ok, hasCapacitorGlobal })

  if (!ok && !hasCapacitorGlobal) return

  try {
    const mod = await import('./bridge')
    mod.installAndroidBridge()
    // eslint-disable-next-line no-console
    console.log('[android-bridge] installed; window.slaveVPN =', typeof (window as unknown as { slaveVPN?: unknown }).slaveVPN)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[android-bridge] install failed', err)
    throw err
  }
}

export { isCapacitorAndroid }

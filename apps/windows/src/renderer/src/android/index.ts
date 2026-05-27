import { isCapacitorAndroid } from './detect'

/**
 * Activate the Android bridge if we're running inside a Capacitor Android
 * shell. On Windows/Electron this is a no-op — the dynamic import only fires
 * when needed, keeping @capacitor/* code out of the Windows hot path.
 */
export async function installAndroidBridgeIfNeeded(): Promise<void> {
  if (!isCapacitorAndroid()) return
  const mod = await import('./bridge')
  mod.installAndroidBridge()
}

export { isCapacitorAndroid }

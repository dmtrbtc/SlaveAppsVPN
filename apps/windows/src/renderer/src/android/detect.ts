/**
 * Detect whether the renderer is running inside a Capacitor Android shell.
 *
 * Uses @capacitor/core's own runtime check so we don't depend on the order
 * Capacitor's native bridge injects the global. On Electron / a plain
 * browser, @capacitor/core's Capacitor.isNativePlatform() simply returns
 * false — the import is safe and side-effect-free.
 */
import { Capacitor } from '@capacitor/core'

export function isCapacitorAndroid(): boolean {
  try {
    const native = Capacitor.isNativePlatform()
    const platform = Capacitor.getPlatform()
    // Log so the user can see detection result in adb logcat (Capacitor/Console)
    // even when the rest of the bridge fails to install.
    // eslint-disable-next-line no-console
    console.log('[android-bridge] detect', { native, platform, hasGlobal: typeof (window as unknown as { Capacitor?: unknown }).Capacitor })
    return native && platform === 'android'
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[android-bridge] detect failed', err)
    return false
  }
}

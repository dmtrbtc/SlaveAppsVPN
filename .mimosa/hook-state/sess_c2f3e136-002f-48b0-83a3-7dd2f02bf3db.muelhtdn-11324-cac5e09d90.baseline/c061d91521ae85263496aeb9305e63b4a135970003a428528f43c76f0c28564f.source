/**
 * Platform detection for the shared renderer bundle.
 *
 * The same React bundle ships in the Electron desktop app and the Capacitor
 * Android shell (apps/android wraps apps/windows/out/renderer). We use this to
 * gate desktop-only chrome (window controls / draggable title bar) and to swap
 * the desktop sidebar for a mobile bottom-nav.
 */
import { isCapacitorAndroid } from '../android/detect'

/**
 * True when running inside the Capacitor Android shell.
 *
 * Computed once at module load — the platform cannot change at runtime.
 */
export const IS_MOBILE: boolean = (() => {
  try {
    return isCapacitorAndroid()
  } catch {
    return false
  }
})()

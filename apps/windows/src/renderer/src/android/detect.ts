/**
 * Detect whether the renderer is running inside a Capacitor Android shell.
 *
 * On Windows (Electron) this returns false and all Android-bridge code stays
 * dormant; @capacitor/* modules can still be imported safely — their methods
 * are no-ops outside a native shell.
 */
export function isCapacitorAndroid(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean } }).Capacitor
  if (!cap) return false
  if (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return typeof cap.getPlatform === 'function' ? cap.getPlatform() === 'android' : true
  }
  return false
}

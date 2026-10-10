import { Capacitor, registerPlugin } from '@capacitor/core'
import { IS_MOBILE } from '../lib/platform'

// Minimal surface of @capacitor/app, accessed via registerPlugin so the Windows
// renderer build doesn't need @capacitor/app as a dependency (the native module
// is linked into the APK by `cap sync`; we only call it on native platforms).
interface CapAppPlugin {
  addListener(
    eventName: 'appStateChange',
    listenerFunc: (data: { isActive: boolean }) => void,
  ): Promise<{ remove: () => void }>
}

/**
 * Whether the app is currently in the foreground with the UI visible.
 *
 * The Android shell keeps the WebView alive while the VPN foreground service
 * runs, so renderer timers keep firing around the clock even with the app
 * backgrounded and the screen off. Every periodic bridge/JNI poll must check
 * this gate first and skip its tick while hidden — otherwise the polling stack
 * alone prevents the device from ever reaching deep idle (battery drain).
 *
 * Two independent signals, ANDed: document visibility (Chromium marks the page
 * hidden when the activity stops) and the @capacitor/app appStateChange event
 * (authoritative activity pause/resume). On Windows this is always true —
 * desktop polling behaviour is unchanged.
 */
let docVisible = true
let capActive = true
let initialized = false

function ensureInitialized(): void {
  if (initialized) return
  initialized = true
  if (typeof document !== 'undefined') {
    docVisible = document.visibilityState === 'visible'
    document.addEventListener('visibilitychange', () => {
      docVisible = document.visibilityState === 'visible'
    })
  }
  if (Capacitor.isNativePlatform()) {
    const CapApp = registerPlugin<CapAppPlugin>('App')
    void CapApp.addListener('appStateChange', data => {
      capActive = data.isActive
    }).catch(() => {
      // The plugin is part of the standard Capacitor Android runtime; if it is
      // ever missing, fall back to the document-visibility signal alone.
    })
  }
}

export function isAppVisible(): boolean {
  if (!IS_MOBILE) return true
  ensureInitialized()
  return docVisible && capActive
}

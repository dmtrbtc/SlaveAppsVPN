import { registerPlugin } from '@capacitor/core'
import type { SlaveVpnPluginInterface } from './types'

// Registers the native Capacitor plugin "SlaveVpn".
// The native implementation lives in:
//   android/app/src/main/java/com/slavevpn/plugin/SlaveVpnPlugin.kt
//
// In dev / web fallback, the plugin throws "not implemented" for every
// method — this lets the renderer load in a browser for UI work without
// crashing.
export const SlaveVpn = registerPlugin<SlaveVpnPluginInterface>('SlaveVpn', {
  web: () => import('./SlaveVpnPluginWeb').then(m => new m.SlaveVpnPluginWeb()),
})

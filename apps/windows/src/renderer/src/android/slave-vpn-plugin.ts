import { registerPlugin } from '@capacitor/core'

// Capacitor warns and can bind listeners twice when the same native plugin is
// registered by independent renderer modules. Keep one proxy for the bundle.
const plugin = registerPlugin<Record<string, unknown>>('SlaveVpn')

export function getSlaveVpnPlugin<T>(): T {
  return plugin as T
}
